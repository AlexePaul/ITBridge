import { ClassSession } from 'src/entities/class-session.entity';
import { ClassSessionStatus } from 'src/enum/class-session-status.enum';
import { OutboxService, QueuedMessage } from 'src/modules/mail/outbox.service';
import { DEFAULT_OFFICE_ADDRESS } from 'src/modules/mail/office-address';
import { ClassSessionService } from './class-session.service';
import { composeLateRegisterAlert, GRACE_MINUTES, isInProgressAndLate, LateRegisterJob, sessionEndStamp } from './late-register.job';

/**
 * The fifteen-minute alert, tested without waiting until a quarter past four.
 *
 * That is why `checkAt(now)` takes the instant: everything worth checking here is about *which
 * classes are inside the window at a given minute*, and the window is the whole story. The
 * boundaries are asserted at the minute on both ends, because both of them are decisions —
 * the opening one is the story's promise, and the closing one is what keeps the alert from
 * becoming a second, worse copy of the daily report.
 *
 * The job is constructed directly rather than through `Test.createTestingModule`: the recipient is
 * read in the constructor, so the configuration cases need their own constructions. Same reason as
 * `UnmarkedAttendanceJob`'s spec.
 */
describe('LateRegisterJob', () => {
    let classSessionService: { findUnmarkedSessions: jest.Mock };
    let outbox: { queue: jest.Mock };

    /**
     * Comfortably inside the window: 13:25Z is 16:25 at the school, twenty-five minutes into a class
     * that started at 16:00 and runs to 17:30. Every test that is not about a boundary uses it, so
     * that a failure there means what it says rather than "the instant drifted out of the window".
     */
    const AT_16_25 = new Date('2026-08-28T13:25:00Z');

    /** Enough of a session for the window and the message to be worked out from it. */
    function session(overrides: { id?: number; group?: string; startTime?: string; endTime?: string; room?: string; location?: string } = {}): ClassSession {
        return {
            id: overrides.id ?? 1,
            group: { name: overrides.group ?? 'Scratch Începători' },
            date: new Date(2026, 7, 28),
            startTime: overrides.startTime ?? '16:00:00',
            endTime: overrides.endTime ?? '17:30:00',
            room: { name: overrides.room ?? 'Sala 1', location: { name: overrides.location ?? 'Drumul Taberei' } },
            status: ClassSessionStatus.SCHEDULED,
            notes: null,
            attendances: [],
        } as unknown as ClassSession;
    }

    function createJob(): LateRegisterJob {
        return new LateRegisterJob(classSessionService as unknown as ClassSessionService, outbox as unknown as OutboxService);
    }

    /** The single message the job wrote, or a failure if it wrote none. */
    function queuedMessage(): QueuedMessage {
        expect(outbox.queue).toHaveBeenCalledTimes(1);
        return outbox.queue.mock.calls[0][0] as QueuedMessage;
    }

    beforeEach(() => {
        classSessionService = { findUnmarkedSessions: jest.fn().mockResolvedValue([]) };
        outbox = { queue: jest.fn().mockResolvedValue({ id: 7 }) };
        delete process.env.MAIL_OFFICE_ADDRESS;
    });

    afterEach(() => {
        delete process.env.MAIL_OFFICE_ADDRESS;
    });

    /**
     * The window, minute by minute. Fifteen is the story's number and the boundary is inclusive:
     * "started fifteen minutes ago" is late, "started fourteen minutes ago" is a teacher settling
     * children at computers.
     */
    describe('the window opens at minute fifteen', () => {
        it('says nothing fourteen minutes in', async () => {
            classSessionService.findUnmarkedSessions.mockResolvedValue([session()]);

            const result = await createJob().checkAt(new Date('2026-08-28T13:14:00Z'));

            expect(outbox.queue).not.toHaveBeenCalled();
            expect(result).toEqual({ checkedAt: '2026-08-28T16:14', late: 0, alerted: 0 });
        });

        it('alerts exactly fifteen minutes in', async () => {
            classSessionService.findUnmarkedSessions.mockResolvedValue([session()]);

            const result = await createJob().checkAt(new Date('2026-08-28T13:15:00Z'));

            expect(outbox.queue).toHaveBeenCalledTimes(1);
            expect(result).toEqual({ checkedAt: '2026-08-28T16:15', late: 1, alerted: 1 });
        });

        // The ticks are five minutes apart, so an alert lands somewhere in the first twenty minutes
        // rather than on the fifteenth exactly. Everything after that is still in the window.
        it('still alerts on the tick after, when the first one landed at minute thirteen', async () => {
            classSessionService.findUnmarkedSessions.mockResolvedValue([session()]);

            await createJob().checkAt(new Date('2026-08-28T13:18:00Z'));

            expect(outbox.queue).toHaveBeenCalledTimes(1);
        });
    });

    /**
     * The closing end, which is the decision this job stands on. The alert exists because a phone
     * call can still change the answer; once the class is over it cannot, and saying so anyway
     * would be a worse copy of the ten o'clock report.
     */
    describe('the window shuts when the class does', () => {
        it('alerts a minute before the class ends', async () => {
            classSessionService.findUnmarkedSessions.mockResolvedValue([session()]);

            await createJob().checkAt(new Date('2026-08-28T14:29:00Z'));

            expect(outbox.queue).toHaveBeenCalledTimes(1);
        });

        it('says nothing once the class has finished', async () => {
            classSessionService.findUnmarkedSessions.mockResolvedValue([session()]);

            const result = await createJob().checkAt(new Date('2026-08-28T14:30:00Z'));

            expect(outbox.queue).not.toHaveBeenCalled();
            expect(result.late).toBe(0);
        });

        /**
         * The property that closing end buys: a process that was down all afternoon comes back to
         * silence rather than firing a dozen alerts about classes that ended hours ago. Those
         * classes are not forgotten — they are tomorrow's ten o'clock list.
         */
        it('does not flood the office after an outage that spanned the whole afternoon', async () => {
            classSessionService.findUnmarkedSessions.mockResolvedValue([
                session({ id: 1, startTime: '16:00:00', endTime: '17:30:00' }),
                session({ id: 2, startTime: '18:00:00', endTime: '19:30:00' }),
            ]);

            const result = await createJob().checkAt(new Date('2026-08-28T18:00:00Z')); // 21:00 school time

            expect(outbox.queue).not.toHaveBeenCalled();
            expect(result.late).toBe(0);
        });
    });

    /**
     * The same question as the daily report, asked on a narrower slice of the calendar. The service
     * is what decides that a cancelled class has no register to take and that a marked one is not
     * unmarked; this job adds only the hours.
     */
    it('asks for the days the window can touch, and nothing wider', async () => {
        await createJob().checkAt(AT_16_25);

        expect(classSessionService.findUnmarkedSessions).toHaveBeenCalledWith({ dateFrom: '2026-08-28', dateTo: '2026-08-28' });
    });

    // Just after midnight the cutoff is still yesterday, so the pair of dates is the only time the
    // range is wider than one day. No class runs then; the query is asked anyway rather than trusted.
    it('spans two calendar days when the cutoff falls before midnight', async () => {
        await createJob().checkAt(new Date('2026-08-27T21:05:00Z')); // 00:05 school time on the 28th

        expect(classSessionService.findUnmarkedSessions).toHaveBeenCalledWith({ dateFrom: '2026-08-27', dateTo: '2026-08-28' });
    });

    /** The predicate, at the minute, without a job around it — both stamps are school-clock text. */
    describe('isInProgressAndLate', () => {
        const s = session();

        it('ends the session in the same shape it starts it', () => {
            expect(sessionEndStamp(s)).toBe('2026-08-28T17:30');
        });

        it('is inclusive at the fifteenth minute and exclusive at the end', () => {
            expect(isInProgressAndLate(s, '2026-08-28T16:15', '2026-08-28T16:00')).toBe(true);
            expect(isInProgressAndLate(s, '2026-08-28T16:14', '2026-08-28T15:59')).toBe(false);
            expect(isInProgressAndLate(s, '2026-08-28T17:29', '2026-08-28T17:14')).toBe(true);
            expect(isInProgressAndLate(s, '2026-08-28T17:30', '2026-08-28T17:15')).toBe(false);
        });
    });

    /**
     * One alert per class, not one list per pass. Two groups unmarked at the same minute are two
     * phone calls to two different people, and a single email covering both is one of them being
     * forgotten. The daily report is a list because by then it is a list of paperwork.
     */
    it('sends one message per class, not one message per pass', async () => {
        classSessionService.findUnmarkedSessions.mockResolvedValue([
            session({ id: 1 }),
            session({ id: 2, group: 'Python Avansați', room: 'Sala 2', location: 'Străulești' }),
        ]);

        const result = await createJob().checkAt(AT_16_25);

        expect(outbox.queue).toHaveBeenCalledTimes(2);
        expect(result).toEqual({ checkedAt: '2026-08-28T16:25', late: 2, alerted: 2 });
    });

    /**
     * The session stays inside the window for the rest of the hour, so without a key on the session
     * the office would get the same alert every five minutes until the class ended. It is keyed on
     * the session rather than on the minute, which also makes a restart free.
     */
    it('keys the alert on the session and its start, so the next tick cannot send it again', async () => {
        classSessionService.findUnmarkedSessions.mockResolvedValue([session({ id: 42 })]);

        await createJob().checkAt(AT_16_25);

        expect(queuedMessage().dedupeKey).toBe('late-register:42:2026-08-28T16:00');
    });

    // `moveSession` keeps the row and its id. A class moved to another day after it was alerted on
    // would otherwise hit the key written for the slot it was moved away from, and stay silent.
    it('gives a moved session a fresh key, so the rescheduled class is alerted on too', async () => {
        const moved = { ...session({ id: 42, startTime: '10:00:00', endTime: '11:30:00' }), date: new Date(2026, 7, 29) };
        classSessionService.findUnmarkedSessions.mockResolvedValue([moved]);

        await createJob().checkAt(new Date('2026-08-29T07:20:00Z')); // 10:20 school time

        expect(queuedMessage().dedupeKey).toBe('late-register:42:2026-08-29T10:00');
    });

    it('counts a class the outbox refused as still late, but not as alerted', async () => {
        classSessionService.findUnmarkedSessions.mockResolvedValue([session()]);
        outbox.queue.mockResolvedValue(null);

        const result = await createJob().checkAt(AT_16_25);

        expect(result).toEqual({ checkedAt: '2026-08-28T16:25', late: 1, alerted: 0 });
    });

    describe('recipient', () => {
        it('goes to the school office by default', async () => {
            classSessionService.findUnmarkedSessions.mockResolvedValue([session()]);

            await createJob().checkAt(AT_16_25);

            expect(queuedMessage().to).toBe(DEFAULT_OFFICE_ADDRESS);
        });

        it('goes wherever MAIL_OFFICE_ADDRESS says instead', async () => {
            process.env.MAIL_OFFICE_ADDRESS = 'secretariat@exemplu.ro';
            classSessionService.findUnmarkedSessions.mockResolvedValue([session()]);

            await createJob().checkAt(AT_16_25);

            expect(queuedMessage().to).toBe('secretariat@exemplu.ro');
        });
    });

    describe('the scheduled tick', () => {
        // The guard the integration suites depend on: jest sets NODE_ENV, those suites build the real
        // AppModule, and a timer querying the database mid-assertion is the failure that shows up
        // once and never reproduces.
        it('does nothing at all under NODE_ENV=test', async () => {
            await createJob().scheduledTick();

            expect(classSessionService.findUnmarkedSessions).not.toHaveBeenCalled();
        });

        /**
         * An unhandled rejection out of a timer callback takes the Node process down, and with it
         * the outbox dispatcher and every other job. A database that was unreachable at a quarter
         * past four must cost one alert, not the whole backend.
         */
        it('swallows a failure instead of taking the process down', async () => {
            const previous = process.env.NODE_ENV;
            process.env.NODE_ENV = 'development';
            classSessionService.findUnmarkedSessions.mockRejectedValue(new Error('connection terminated'));
            try {
                await expect(createJob().scheduledTick()).resolves.toBeUndefined();
            } finally {
                process.env.NODE_ENV = previous;
            }
        });
    });

    /**
     * The window is read on the school's clock, not the host's. CI is not in Romania and the server
     * need not be; a session stores a local date and a local `HH:mm:ss`, so comparing either
     * against a UTC instant is the off-by-one-day trap the date helpers exist to avoid.
     */
    it('reads the clock in Bucharest, not in UTC', async () => {
        classSessionService.findUnmarkedSessions.mockResolvedValue([session()]);

        // 13:20Z is 16:20 at the school — twenty minutes into a class that started at 16:00. Read
        // as UTC it would be twenty *to* four, before the class had begun.
        const result = await createJob().checkAt(new Date('2026-08-28T13:20:00Z'));

        expect(result).toEqual({ checkedAt: '2026-08-28T16:20', late: 1, alerted: 1 });
    });

    describe('wording', () => {
        it('leads with the group and the hour, so the subject line is the phone call', () => {
            const { subject } = composeLateRegisterAlert(session());

            expect(subject).toBe(`Prezență nemarcată la ${GRACE_MINUTES} minute: Scratch Începători, 16:00`);
        });

        // Group, hours and room: everything needed to work out who to ring without opening the app.
        it('names the group, the hours and the room', () => {
            expect(composeLateRegisterAlert(session()).bodyText).toContain('- Scratch Începători, 16:00-17:30, Sala 1 (Drumul Taberei)');
        });

        // The reason the message exists, said out loud — otherwise it reads as a complaint about
        // paperwork rather than as a prompt to pick up the phone.
        it('says the class is still running and that a call can still help', () => {
            expect(composeLateRegisterAlert(session()).bodyText).toContain('Ora e încă în desfășurare');
        });

        // What to do about it, and what happens if nobody does.
        it('says it arrives once, and where the class turns up if it stays unmarked', () => {
            const { bodyText } = composeLateRegisterAlert(session());

            expect(bodyText).toContain('o singură dată pentru fiecare ședință');
            expect(bodyText).toContain('mâine la 10:00');
            expect(bodyText).toContain('anuleaz-o din');
        });
    });
});
