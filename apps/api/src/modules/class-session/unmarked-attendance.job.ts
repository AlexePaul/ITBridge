import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ClassSession } from 'src/entities/class-session.entity';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { Weekday } from 'src/enum/weekday.enum';
import { ClassSessionService } from './class-session.service';
import { addDays, isoWeekday, parseIsoDate, toIsoDate } from './class-session.dates';
import { officeAddress } from 'src/modules/mail/office-address';

/**
 * The daily reminder about registers nobody took, from E12/S7.
 *
 * Every morning at ten it asks for yesterday's `scheduled` sessions that have no attendance rows,
 * and if there are any it writes **one** message to the school office listing them. If there are
 * none it writes nothing at all: a reminder that arrives on the good days too is a reminder people
 * filter, and then it is not there on the day it mattered.
 *
 * **The selection is `reportFor(date)`, a plain method.** The cron only decides *when*, exactly as
 * `OutboxDispatcher` does — so every case below can be tested at any hour of the day, against any
 * date, without a clock.
 *
 * **This must run in exactly one instance.** Two PM2 cluster workers would both wake at ten and
 * both compose the same message; `dedupeKey` means the second one is refused by the database rather
 * than delivered, so the failure mode is a wasted query, not two emails. The single-instance pin
 * still belongs in the ecosystem file from E01/S4, **which does not exist yet** — this backend is
 * not deployed anywhere, so the job is built and tested here but does not run in production until
 * the deploy story lands.
 *
 * On the epic: E12/S7 argues for a reminder 10-15 minutes into the class, because at that point it
 * can still change something. That remains the right target and is not what this is. This is the
 * job the school asked for — one message, the morning after, about what was missed — and it needs
 * no per-session timers. When the 15-minute version is built, `findUnmarkedSessions` is the same
 * question asked with a different interval.
 */

/** 10:00, school time. */
export const DAILY_AT_TEN = '0 10 * * *';

/**
 * The school is in Romania; the server need not be, and CI certainly is not. Pinning the schedule
 * to the school's zone is what keeps "ten in the morning" and "yesterday" meaning the same thing
 * wherever the process happens to run, instead of drifting by the host's offset and by DST.
 */
export const SCHOOL_TIME_ZONE = 'Europe/Bucharest';

/**
 * One message per day reported on, enforced by the database.
 *
 * This is what makes the job safe to re-run: a restart at 10:05 after a run at 10:00, a manual
 * invocation, a second instance during a deploy. `OutboxService.queue` inserts with
 * `ON CONFLICT DO NOTHING`, so the duplicate is refused and returns `null` instead of arriving in
 * the office inbox a second time.
 */
export const DEDUPE_PREFIX = 'unmarked-attendance:';

export interface UnmarkedReminderResult {
    /** The day reported on, `YYYY-MM-DD`. */
    date: string;
    /** How many sessions were found unmarked. */
    unmarked: number;
    /** Whether a message was written. False both when there was nothing to report and when the day's message was already queued. */
    queued: boolean;
}

@Injectable()
export class UnmarkedAttendanceJob {
    private readonly logger = new Logger('UnmarkedAttendance');

    /**
     * Configurable so the school can redirect the reminder without a deploy. Covered by the `MAIL_*`
     * wildcard already in `turbo.json`, so a strict-mode task can see it.
     *
     * Read once, at construction: changing it means restarting the process either way, and a value
     * that can change between two lines of the same job is worse than one that cannot.
     */
    private readonly recipient = officeAddress();

    constructor(
        private readonly classSessionService: ClassSessionService,
        private readonly outbox: OutboxService,
    ) {}

    /**
     * The clock, and nothing else.
     *
     * `disabled` under `NODE_ENV=test` because jest sets that variable and both suites build the
     * real `AppModule`: a run that happens to span 10:00:00 would otherwise queue a message in the
     * middle of somebody's assertions, which is the kind of failure that appears once a year and is
     * never reproduced. The tests call `reportFor` directly, which is the whole method anyway.
     */
    @Cron(DAILY_AT_TEN, {
        name: 'unmarked-attendance-reminder',
        timeZone: SCHOOL_TIME_ZONE,
        disabled: process.env.NODE_ENV === 'test',
    })
    async runScheduled(): Promise<void> {
        try {
            await this.reportFor(previousDay());
        } catch (error: unknown) {
            // An unhandled rejection out of a timer callback takes the process down in Node, which
            // would stop the outbox dispatcher too. Tomorrow's run asks the same question again;
            // nothing here needs to be recovered.
            this.logger.error(`The unmarked-attendance reminder failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Looks at one day and queues the reminder if there is anything to say.
     *
     * The question is `ClassSessionService.findUnmarkedSessions`, not a query of its own: the
     * timetable screen and this email have to agree about what "unmarked" means, and if they ever
     * disagree the one that is wrong is the one nobody is looking at.
     */
    async reportFor(date: string): Promise<UnmarkedReminderResult> {
        const sessions = await this.classSessionService.findUnmarkedSessions({ dateFrom: date, dateTo: date });

        if (sessions.length === 0) {
            // Deliberately silent towards the office, and only a debug line here. Most days are
            // this day.
            this.logger.debug(`Nothing unmarked on ${date}; no reminder queued.`);
            return { date, unmarked: 0, queued: false };
        }

        const { subject, bodyText } = composeUnmarkedReminder(date, sessions);
        const message = await this.outbox.queue({
            to: this.recipient,
            subject,
            bodyText,
            dedupeKey: `${DEDUPE_PREFIX}${date}`,
        });

        if (message === null) {
            this.logger.log(`A reminder for ${date} was already queued; ${sessions.length} unmarked session(s) not reported again.`);
            return { date, unmarked: sessions.length, queued: false };
        }

        // The recipient stays out of the log, as everywhere else in the mail path; the outbox row
        // has it and is access-controlled.
        this.logger.log(`Queued a reminder about ${sessions.length} unmarked session(s) on ${date} as outbox message ${message.id}.`);
        return { date, unmarked: sessions.length, queued: true };
    }
}

/** Yesterday, in the school's timezone rather than the host's. */
export function previousDay(now: Date = new Date()): string {
    return toIsoDate(addDays(parseIsoDate(schoolDateOf(now)), -1));
}

/**
 * The calendar date at a given instant, as the school sees it.
 *
 * `en-CA` is the locale whose short date format *is* `YYYY-MM-DD`, which is why it is used here
 * rather than assembling parts by hand. Going through `Intl` rather than through the host's local
 * time is the point: the cron fires on Bucharest time, so the day it reports on has to be worked
 * out on Bucharest time too, or a server in California would ask about the wrong day.
 */
export function schoolDateOf(now: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: SCHOOL_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(now);
}

/**
 * The message itself. Romanian, because it is read by a person at the school - the exception
 * CLAUDE.md carves out of the everything-in-English rule.
 *
 * Exported separately from the job so the wording can be asserted without a queue behind it.
 */
export function composeUnmarkedReminder(date: string, sessions: ClassSession[]): { subject: string; bodyText: string } {
    const day = parseIsoDate(date);
    const weekday = WEEKDAY_NAMES[isoWeekday(day)];
    const when = `${weekday} ${formatRomanianDate(day)}`;
    const count = countSessions(sessions.length);
    const verb = sessions.length === 1 ? 'a rămas' : 'au rămas';

    const lines = sessions.map((session) => `- ${describeSession(session)}`);

    const bodyText = [
        `${capitalise(count)} de ${weekday}, ${formatRomanianDate(day)}, ${verb} fără prezență marcată:`,
        '',
        ...lines,
        '',
        'O ședință apare în lista asta doar dacă e încă „programată" și nu are nicio prezență',
        'înregistrată. Dacă nu s-a ținut, anuleaz-o din orar și nu va mai fi raportată.',
        '',
        'Mesaj automat, trimis o dată pe zi la ora 10:00. În zilele în care totul e marcat nu pleacă',
        'niciun mesaj.',
    ].join('\n');

    return { subject: `Prezență nemarcată: ${count}, ${when}`, bodyText };
}

/** "Scratch Începători, 16:00-17:30, Sala 1 (Drumul Taberei)" - what someone needs to go and ask. */
function describeSession(session: ClassSession): string {
    const hours = `${formatTime(session.startTime)}-${formatTime(session.endTime)}`;
    // `findUnmarkedSessions` joins the room and its location, so both are here. Guarded anyway:
    // a reminder that throws while formatting is a reminder nobody gets.
    const room = session.room?.name ?? 'sală necunoscută';
    const location = session.room?.location?.name;
    const where = location === undefined ? room : `${room} (${location})`;
    return `${session.group?.name ?? 'grupă necunoscută'}, ${hours}, ${where}`;
}

/** A `time` column arrives as `16:00:00`; nobody needs the seconds. */
function formatTime(value: string): string {
    return value.slice(0, 5);
}

function formatRomanianDate(date: Date): string {
    const day = `${date.getDate()}`.padStart(2, '0');
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    return `${day}.${month}.${date.getFullYear()}`;
}

/**
 * Romanian counts nouns in three shapes, and the third one is the surprise: from twenty upwards the
 * number takes `de`. Twenty unmarked classes in a day would mean something much worse than a
 * forgotten register, but the sentence should still be a sentence when it happens.
 */
function countSessions(count: number): string {
    if (count === 1) {
        return 'o ședință';
    }
    return count < 20 ? `${count} ședințe` : `${count} de ședințe`;
}

function capitalise(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Lower case, because these appear mid-sentence: "o ședință de vineri 28.08.2026".
 *
 * `WEEKDAY_LABELS` in `@itbridge/types` has the same seven words, capitalised for a table header,
 * and is not reused here on purpose: `apps/api` imports that package for **types only** today, and
 * pulling a value out of it would make the compiled backend require the workspace package at
 * runtime. Guaranteeing that in production is the deploy story's job, and the deploy story is not
 * written (E01/S4). Seven words are not worth being the first thing to depend on it.
 */
const WEEKDAY_NAMES: Record<Weekday, string> = {
    [Weekday.MONDAY]: 'luni',
    [Weekday.TUESDAY]: 'marți',
    [Weekday.WEDNESDAY]: 'miercuri',
    [Weekday.THURSDAY]: 'joi',
    [Weekday.FRIDAY]: 'vineri',
    [Weekday.SATURDAY]: 'sâmbătă',
    [Weekday.SUNDAY]: 'duminică',
};
