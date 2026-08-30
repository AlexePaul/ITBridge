import { ClassSession } from 'src/entities/class-session.entity';
import { ClassSessionStatus } from 'src/enum/class-session-status.enum';
import { OutboxService, QueuedMessage } from 'src/modules/mail/outbox.service';
import { ClassSessionService } from './class-session.service';
import { composeUnmarkedReminder, previousDay, schoolDateOf, UnmarkedAttendanceJob } from './unmarked-attendance.job';
import { DEFAULT_OFFICE_ADDRESS } from 'src/modules/mail/office-address';

/**
 * The daily reminder, tested without waiting for ten in the morning.
 *
 * That is the reason `reportFor` is a method and the cron is three lines that call it: everything
 * worth checking here is about *which day is asked about* and *what is written down*, and none of
 * it should need a clock or a scheduler.
 *
 * The job is constructed directly rather than through `Test.createTestingModule` — the recipient is
 * read in the constructor, so the two configuration cases need two constructions. Same reason as
 * `OutboxDispatcher`'s spec.
 */
describe('UnmarkedAttendanceJob', () => {
    let classSessionService: { findUnmarkedSessions: jest.Mock };
    let outbox: { queue: jest.Mock };

    /** Enough of a session for the message to be composed from it. */
    function session(overrides: { group?: string; startTime?: string; endTime?: string; room?: string; location?: string } = {}): ClassSession {
        return {
            id: 1,
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

    function createJob(): UnmarkedAttendanceJob {
        return new UnmarkedAttendanceJob(classSessionService as unknown as ClassSessionService, outbox as unknown as OutboxService);
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
     * A day the school does not teach on. Nothing is scheduled, so nothing can be unmarked, and no
     * message may leave — this is the case that decides whether the reminder is worth reading at
     * all. A daily message that also arrives on Sundays is one people stop opening, and then it is
     * not there on the Monday it mattered.
     */
    it('writes nothing for a day with no classes at all', async () => {
        const result = await createJob().reportFor('2026-08-30');

        expect(outbox.queue).not.toHaveBeenCalled();
        expect(result).toEqual({ date: '2026-08-30', unmarked: 0, queued: false });
    });

    /**
     * The good day: classes were held and every register was taken. `findUnmarkedSessions` is what
     * tells the two days apart — a marked class fails its `attendance.id IS NULL` condition, an
     * absent one is not a row at all — and its own spec covers that discrimination. From here both
     * days look identical, which is exactly the point: the job has one question and one silence.
     */
    it('writes nothing for a day whose classes were all marked', async () => {
        classSessionService.findUnmarkedSessions.mockResolvedValue([]);

        const result = await createJob().reportFor('2026-08-28');

        expect(outbox.queue).not.toHaveBeenCalled();
        expect(result.queued).toBe(false);
    });

    it('asks about exactly one day, both ends', async () => {
        await createJob().reportFor('2026-08-28');

        expect(classSessionService.findUnmarkedSessions).toHaveBeenCalledWith({ dateFrom: '2026-08-28', dateTo: '2026-08-28' });
    });

    /**
     * Two unmarked classes, one message. Not one message per class: the office reads a list and
     * goes and asks two people, and two separate emails about the same morning are two chances to
     * archive one of them.
     */
    it('reports two unmarked classes in a single message', async () => {
        classSessionService.findUnmarkedSessions.mockResolvedValue([
            session(),
            session({ group: 'Python Avansați', startTime: '18:00:00', endTime: '19:30:00', room: 'Sala 2', location: 'Străulești' }),
        ]);

        const result = await createJob().reportFor('2026-08-28');

        const message = queuedMessage();
        expect(message.subject).toBe('Prezență nemarcată: 2 ședințe, vineri 28.08.2026');
        expect(message.bodyText).toContain('2 ședințe de vineri, 28.08.2026, au rămas fără prezență marcată');
        expect(result).toEqual({ date: '2026-08-28', unmarked: 2, queued: true });
    });

    /** Group, hour and room, which is everything needed to work out who to ask. */
    it('names the group, the hours and the room of each class', async () => {
        classSessionService.findUnmarkedSessions.mockResolvedValue([
            session(),
            session({ group: 'Python Avansați', startTime: '18:00:00', endTime: '19:30:00', room: 'Sala 2', location: 'Străulești' }),
        ]);

        await createJob().reportFor('2026-08-28');

        expect(queuedMessage().bodyText).toContain('- Scratch Începători, 16:00-17:30, Sala 1 (Drumul Taberei)');
        expect(queuedMessage().bodyText).toContain('- Python Avansați, 18:00-19:30, Sala 2 (Străulești)');
    });

    /**
     * The key that makes the job safe to run twice — a restart at 10:05, a second instance during a
     * deploy, somebody invoking it by hand. It keys on the day reported on, not on the moment of
     * sending, because those two runs are about the same morning.
     */
    it('keys the message on the day it reports, so a second run cannot send it again', async () => {
        classSessionService.findUnmarkedSessions.mockResolvedValue([session()]);

        await createJob().reportFor('2026-08-28');

        expect(queuedMessage().dedupeKey).toBe('unmarked-attendance:2026-08-28');
    });

    it('reports the day as unqueued when the outbox refused it as a duplicate', async () => {
        classSessionService.findUnmarkedSessions.mockResolvedValue([session()]);
        outbox.queue.mockResolvedValue(null);

        const result = await createJob().reportFor('2026-08-28');

        expect(result).toEqual({ date: '2026-08-28', unmarked: 1, queued: false });
    });

    describe('recipient', () => {
        it('goes to the school office by default', async () => {
            classSessionService.findUnmarkedSessions.mockResolvedValue([session()]);

            await createJob().reportFor('2026-08-28');

            expect(queuedMessage().to).toBe(DEFAULT_OFFICE_ADDRESS);
        });

        // The whole reason it is a variable: the office can be redirected without a deploy.
        it('goes wherever MAIL_OFFICE_ADDRESS says instead', async () => {
            process.env.MAIL_OFFICE_ADDRESS = 'secretariat@exemplu.ro';
            classSessionService.findUnmarkedSessions.mockResolvedValue([session()]);

            await createJob().reportFor('2026-08-28');

            expect(queuedMessage().to).toBe('secretariat@exemplu.ro');
        });

        // An empty value in a deployment's environment is not an address, and silently sending
        // nowhere is worse than falling back to the one address that is certainly read.
        it('falls back when the variable is set to blank', async () => {
            process.env.MAIL_OFFICE_ADDRESS = '   ';
            classSessionService.findUnmarkedSessions.mockResolvedValue([session()]);

            await createJob().reportFor('2026-08-28');

            expect(queuedMessage().to).toBe(DEFAULT_OFFICE_ADDRESS);
        });
    });

    describe('the scheduled run', () => {
        it('reports on yesterday', async () => {
            jest.useFakeTimers().setSystemTime(new Date('2026-08-29T07:00:00Z'));
            try {
                await createJob().runScheduled();
            } finally {
                jest.useRealTimers();
            }

            expect(classSessionService.findUnmarkedSessions).toHaveBeenCalledWith({ dateFrom: '2026-08-28', dateTo: '2026-08-28' });
        });

        /**
         * An unhandled rejection out of a timer callback takes the Node process down, and with it
         * the outbox dispatcher and every other job. A database that was unreachable at ten must
         * cost one reminder, not the whole backend.
         */
        it('swallows a failure instead of taking the process down', async () => {
            classSessionService.findUnmarkedSessions.mockRejectedValue(new Error('connection terminated'));

            await expect(createJob().runScheduled()).resolves.toBeUndefined();
        });
    });

    /**
     * The day is worked out on the school's clock, not the host's. The cron fires on Bucharest
     * time, so a server elsewhere has to agree with it about which day just ended — otherwise the
     * reminder quietly reports on the day before yesterday, or on today, and the list is empty in
     * both cases.
     */
    describe('which day', () => {
        it('reads the calendar date in Bucharest, not in UTC', () => {
            // 21:30 UTC on the 28th is already half past midnight on the 29th in Bucharest.
            expect(schoolDateOf(new Date('2026-08-28T21:30:00Z'))).toBe('2026-08-29');
        });

        it('steps back one day, across the end of a month', () => {
            expect(previousDay(new Date('2026-09-01T07:00:00Z'))).toBe('2026-08-31');
        });
    });

    /**
     * Romanian counts nouns in three shapes, and the last one is the one that gets forgotten: from
     * twenty upwards the number takes `de`. Twenty unmarked classes in a day means something worse
     * than a forgotten register, but the sentence should still be a sentence when it happens.
     */
    describe('wording', () => {
        it('uses the singular for one class', () => {
            const { subject, bodyText } = composeUnmarkedReminder('2026-08-28', [session()]);

            expect(subject).toBe('Prezență nemarcată: o ședință, vineri 28.08.2026');
            expect(bodyText).toContain('O ședință de vineri, 28.08.2026, a rămas fără prezență marcată');
        });

        it('takes "de" from twenty upwards', () => {
            const many = Array.from({ length: 20 }, () => session());

            expect(composeUnmarkedReminder('2026-08-28', many).subject).toBe('Prezență nemarcată: 20 de ședințe, vineri 28.08.2026');
        });

        // Every weekday name is Romanian and lower case, because it appears mid-sentence.
        it('names the weekday', () => {
            expect(composeUnmarkedReminder('2026-08-31', [session()]).subject).toContain('luni 31.08.2026');
        });

        // What to do about it, so the message is an instruction and not just a complaint.
        it('says how a class stops being reported', () => {
            expect(composeUnmarkedReminder('2026-08-28', [session()]).bodyText).toContain('anuleaz-o din orar');
        });
    });
});
