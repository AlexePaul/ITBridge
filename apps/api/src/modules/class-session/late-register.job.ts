import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { ClassSession } from 'src/entities/class-session.entity';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { officeAddress } from 'src/modules/mail/office-address';
import { schoolLocalStamp, sessionStartStamp } from 'src/modules/attendance/absence-notice.rules';
import { ClassSessionService } from './class-session.service';
import { toIsoDate } from './class-session.dates';
import { describeSession, formatTime } from './class-session.text';

/**
 * The fifteen-minute alert E12/S7 actually asked for.
 *
 * `unmarked-attendance.job.ts` reports yesterday's empty registers at ten the next morning. That is
 * bookkeeping: by then the class is over and the message can only record what was missed. This one
 * is the other half — a class started a quarter of an hour ago and nobody has marked anybody, so
 * somebody at the office can pick up the phone **while the class is still in the room**. At an
 * eight-year-old, "not marked present" and "did not arrive" are the same sentence until a person
 * proves otherwise, and the difference between finding out at minute fifteen and finding out
 * tomorrow morning is the difference between a phone call and a problem.
 *
 * **It replaces nothing.** Both jobs stay: this one can only help while the class is running, and
 * everything it misses — an afternoon when the process was down, a class already over, a register
 * that is still empty at midnight — is still on tomorrow's ten o'clock list.
 *
 * **It is the same question, asked more often.** `ClassSessionService.findUnmarkedSessions` is what
 * both jobs call, so "unmarked" cannot come to mean two different things depending on which email
 * you are reading. All this adds is a time window on top of it.
 *
 * **The pass is `checkAt(now)`, a plain method**, exactly as every other job here keeps its
 * selection out of its clock: the whole point of this one is *when* it fires, and it would be
 * untestable if the only way to reach it were to wait until a quarter past four.
 *
 * **It must run in exactly one instance.** Two PM2 cluster workers would both wake on every tick
 * and both compose the same alert; `dedupeKey` makes the second a refused insert rather than a
 * second email, so the failure mode is a wasted query. The single-instance pin still belongs in the
 * ecosystem file from E01/S4, which does not exist yet — this backend is not deployed anywhere, so
 * the job is built and tested here and sends nothing in production until the deploy story lands.
 */

/**
 * How often the window is checked.
 *
 * Five minutes, which makes the alert land somewhere between minute fifteen and minute twenty. It
 * is a poll rather than a timer armed per session on purpose: a timer would have to be re-armed
 * after every restart, every `POST /class-sessions/generate` and every cancellation, and a timer
 * that was silently never re-armed looks exactly like a quiet afternoon. One indexed query every
 * five minutes cannot be forgotten.
 */
export const CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * How long a class is allowed to run before an empty register means something.
 *
 * Fifteen minutes is the story's number, and it is the right one for a reason worth writing down:
 * a teacher settles fourteen children at computers before touching a phone, so anything shorter
 * would mostly report teachers who are busy teaching. Anything longer and the class is half over.
 */
export const GRACE_MINUTES = 15;

/**
 * One alert per scheduled class, ever — enforced by the database.
 *
 * The session stays in the window for the rest of the hour, so without this the office would get
 * the same alert every five minutes until the class ended. Keying on the session rather than on
 * the moment also makes a restart free: whatever the process did before it died, the insert is
 * refused rather than delivered a second time.
 *
 * The key is the session id **plus its scheduled start**, because `moveSession` keeps the row: a
 * class alerted on at 16:15, then moved to Saturday because the teacher was out, is a new occasion
 * on Saturday and earns one fresh alert there. Keyed on the id alone, the Saturday alert would hit
 * the row written on Tuesday and be silently refused.
 *
 * It is deliberately *not* re-armed when the register stays empty. A second copy of "nobody has
 * marked this class" tells the office nothing it was not told at minute fifteen, and the class not
 * having been marked by the end of the day is tomorrow's ten o'clock message.
 */
export const DEDUPE_PREFIX = 'late-register:';

export interface LateRegisterResult {
    /** The school's wall clock at the moment of the pass, `YYYY-MM-DDTHH:mm`. */
    checkedAt: string;
    /** Sessions that were in the window: started at least `GRACE_MINUTES` ago and not yet over. */
    late: number;
    /** How many alerts were written. Lower than `late` when the session was already alerted on. */
    alerted: number;
}

@Injectable()
export class LateRegisterJob {
    private readonly logger = new Logger('LateRegister');

    /**
     * Read once, at construction, like every other office-bound job: changing it means restarting
     * the process either way, and a recipient that can differ between two lines of the same pass is
     * worse than one that cannot.
     */
    private readonly recipient = officeAddress();

    /** One pass at a time, as in `OutboxDispatcher`: a database that stalls must not let ticks pile up. */
    private running = false;

    constructor(
        private readonly classSessionService: ClassSessionService,
        private readonly outbox: OutboxService,
    ) {}

    /**
     * The clock, and nothing else.
     *
     * The `NODE_ENV=test` guard is inside the method rather than on the decorator because
     * `@Interval` takes no options object — the same reason `OutboxDispatcher` writes it this way.
     * It has to be here at all because jest sets that variable and the integration suites build the
     * real `AppModule`: a timer left running would query the database in the middle of somebody else's
     * assertions and go on doing it while the module was being torn down.
     */
    @Interval('late-register-alert', CHECK_INTERVAL_MS)
    async scheduledTick(): Promise<void> {
        if (process.env.NODE_ENV === 'test' || this.running) return;
        this.running = true;
        try {
            await this.checkAt(new Date());
        } catch (error: unknown) {
            // An unhandled rejection out of a timer callback takes the Node process down, and with
            // it the outbox dispatcher and every other job. A database that was unreachable at a
            // quarter past four must cost one alert; the next tick asks again five minutes later.
            this.logger.error(`The late-register check failed: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            this.running = false;
        }
    }

    /**
     * One pass: everything unmarked that is in the window right now gets an alert, once.
     *
     * The window has **two** ends, and the closing one is the interesting one. It shuts when the
     * class does, because the entire justification for this message is that a phone call can still
     * change the answer — after the last child has gone home it cannot, and the ten o'clock report
     * says the same thing better. It also means a process that was down all afternoon comes back to
     * silence instead of firing a dozen alerts about classes that ended hours ago, which is the
     * behaviour that decides whether anyone still reads the second one.
     *
     * A class no longer than `GRACE_MINUTES` is therefore never alerted on. There is no such class in
     * the timetable, and if one appeared the alert would arrive after it had finished anyway.
     */
    async checkAt(now: Date): Promise<LateRegisterResult> {
        const checkedAt = schoolLocalStamp(now);
        // The instant is shifted and *then* read on the school's clock, rather than fifteen minutes
        // being subtracted from a wall-clock string. Both DST changes happen at night and no class
        // spans them, but a stamp is text and text does not do arithmetic.
        const cutoff = schoolLocalStamp(new Date(now.getTime() - GRACE_MINUTES * 60_000));

        const sessions = await this.classSessionService.findUnmarkedSessions({
            // Two calendar days at most, and only ever one of them in practice. The cutoff and the
            // present fall on different dates only just after midnight, which is no hour for a
            // class — but asking for the pair costs nothing and spares the next reader the
            // question.
            dateFrom: cutoff.slice(0, 10),
            dateTo: checkedAt.slice(0, 10),
        });

        const late = sessions.filter((session) => isInProgressAndLate(session, checkedAt, cutoff));
        let alerted = 0;

        for (const session of late) {
            // One message per class, not one list per pass. Two groups unmarked at the same minute
            // are two phone calls to two different people, and a single email covering both is one
            // of them getting forgotten. The daily report is a list because by then it is a list of
            // paperwork.
            const { subject, bodyText } = composeLateRegisterAlert(session);
            const message = await this.outbox.queue({
                to: this.recipient,
                subject,
                bodyText,
                dedupeKey: `${DEDUPE_PREFIX}${session.id}:${sessionStartStamp(session)}`,
            });
            if (message !== null) {
                alerted += 1;
            }
        }

        if (alerted > 0) {
            // The recipient stays out of the log, as everywhere else in the mail path. Silent when
            // nothing was written, which is very nearly every tick.
            this.logger.log(`${alerted} class(es) still unmarked ${GRACE_MINUTES} minutes in at ${checkedAt}; alerted the office.`);
        }
        return { checkedAt, late: late.length, alerted };
    }
}

/**
 * True when the class started at least `GRACE_MINUTES` ago and has not finished.
 *
 * Text comparison on `YYYY-MM-DDTHH:mm` stamps, both sides in the school's own terms — the session
 * stores a local date and a local `HH:mm:ss`, and comparing either against a UTC instant is the
 * off-by-one-day trap that `class-session.dates.ts` and `absence-notice.rules.ts` both exist to
 * avoid. Exported so the boundary can be asserted at the minute, without a queue behind it.
 */
export function isInProgressAndLate(session: ClassSession, nowStamp: string, cutoffStamp: string): boolean {
    return sessionStartStamp(session) <= cutoffStamp && nowStamp < sessionEndStamp(session);
}

/** The session's own end, in the same shape `sessionStartStamp` gives its start. */
export function sessionEndStamp(session: Pick<ClassSession, 'date' | 'endTime'>): string {
    return `${toIsoDate(session.date)}T${formatTime(session.endTime)}`;
}

/**
 * The message. Romanian, because a person at the school reads it — the exception CLAUDE.md carves
 * out of the everything-in-English rule.
 *
 * Written in code rather than as an E17/S2 template, like its ten o'clock sibling and unlike the
 * parent-facing ones: templates exist so the school can rewrite what goes to *families* without a
 * deploy, and this goes to the school's own desk. Exported separately from the job so the wording
 * can be asserted without a queue behind it.
 */
export function composeLateRegisterAlert(session: ClassSession): { subject: string; bodyText: string } {
    const group = session.group?.name ?? 'Grupă necunoscută';
    const start = formatTime(session.startTime);

    const bodyText = [
        `Grupa ${group} a început la ${start} și, ${GRACE_MINUTES} minute mai târziu, nu are nicio prezență marcată.`,
        '',
        `- ${describeSession(session)}`,
        '',
        'Ora e încă în desfășurare, deci un telefon către profesor mai poate schimba ceva: dacă un',
        'copil n-a ajuns, familia află acum, nu mâine dimineață.',
        '',
        'Mesaj automat, trimis o singură dată pentru fiecare ședință — dacă prezența rămâne',
        'nemarcată, apare mâine la 10:00 în raportul zilnic. Dacă ora nu se ține, anuleaz-o din',
        'orar și nu va mai fi verificată.',
    ].join('\n');

    return { subject: `Prezență nemarcată la ${GRACE_MINUTES} minute: ${group}, ${start}`, bodyText };
}
