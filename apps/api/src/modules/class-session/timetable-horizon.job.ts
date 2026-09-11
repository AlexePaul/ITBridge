import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { schoolDay, SCHOOL_TIME_ZONE } from 'src/common/school-clock';
import { ClassSessionService, DEFAULT_HORIZON_WEEKS } from './class-session.service';

/** Half past four in the morning, school time. */
export const DAILY_BEFORE_DAWN = '0 30 4 * * *';

/** What one top-up did, for the log and for the tests. */
export interface HorizonTopUp {
    /** Active groups the pass looked at. */
    groups: number;
    /** Sessions written. Zero on almost every run, which is the healthy answer. */
    created: number;
    /** Days inside the horizon the school calendar closes. */
    skipped: number;
}

/**
 * Keeps the rolling horizon rolling — the job E12/S1 describes and nobody had written.
 *
 * The timetable is eight weeks deep *from the day somebody last pressed the button*. Nothing moved
 * it forward on its own, so `CLAUDE.md` recorded the gap in the plainest terms available: "job-ul de
 * generare tot nu există — o cheamă cineva." Until somebody did, the horizon thinned by a day every
 * day.
 *
 * **What running out actually looks like, which is the reason this is not cosmetic.** Attendance is
 * marked on `POST /attendance/session/:classSessionId`, so a class with no row cannot be marked at
 * all: the register answers 404 and the screen has nothing to draw. The teacher standing in the room
 * is the person who finds out. And the failure arrives quietly — the horizon does not end, it
 * recedes, so the first missing day is eight weeks after the last press and looks like a bug in the
 * register rather than a timetable that was never written.
 *
 * **Daily rather than weekly, because the horizon is defined from today.** A weekly pass would let
 * it breathe between seven and eight weeks; a daily one keeps the promise the constant makes. It
 * costs one pass over the active groups, and on a normal morning it writes nothing: generation is
 * idempotent on `(group, date)`, so every day already inside the horizon is counted and left alone —
 * including the ones somebody cancelled or moved, which is the half of that rule worth protecting.
 *
 * **The work is `topUp()`, a plain method**, as in every other scheduled thing here: the cron only
 * decides when, so the behaviour can be tested without a clock. `disabled` under `NODE_ENV=test`
 * for the reason `OutboxDispatcher` and `UnmarkedAttendanceJob` give — jest sets that variable and
 * both suites build the real `AppModule`, so a run that happened to span the trigger second would
 * write rows into somebody else's assertions once a year and never reproducibly.
 *
 * **One instance only**, like the rest of the scheduler: `instances: 1` and `exec_mode: 'fork'` in
 * `/srv/itbridge/ecosystem.config.js`, which is not in this repository. Two workers waking together
 * is not a disaster here — `UQ_class_sessions_group_date` turns the collision into an error rather
 * than a doubled timetable — but one of the two passes would fail loudly for no reason.
 */
@Injectable()
export class TimetableHorizonJob {
    private readonly logger = new Logger('TimetableHorizon');

    constructor(private readonly classSessions: ClassSessionService) {}

    /**
     * The clock, and nothing else.
     *
     * Before dawn on the school's own clock, so the day starts with the timetable already extended
     * and so the pass never overlaps somebody editing the calendar. It is after the 03:15 backup
     * deliberately: a `pg_dump` and a write pass over every active group have no reason to share a
     * window.
     */
    @Cron(DAILY_BEFORE_DAWN, {
        name: 'timetable-horizon-top-up',
        timeZone: SCHOOL_TIME_ZONE,
        disabled: process.env.NODE_ENV === 'test',
    })
    async runScheduled(): Promise<void> {
        try {
            await this.topUp();
        } catch (error: unknown) {
            // An unhandled rejection out of a timer callback takes the process down in Node, and
            // this process is also the outbox dispatcher. Tomorrow's pass writes whatever this one
            // did not: the work is idempotent, so nothing here needs recovering.
            this.logger.error(`The timetable top-up failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Extends every active group's timetable to the full horizon.
     *
     * Delegates to `generateSessions` rather than reimplementing the walk: that method already owns
     * the school calendar, the idempotency and the refusal to touch an inactive group, and a second
     * implementation of "which days does this group have" is the kind of duplicate that diverges
     * quietly. Passing no `groupId` is what asks for every active group.
     */
    async topUp(): Promise<HorizonTopUp> {
        // **`from` is passed, not defaulted, and that is a one-day bug closed rather than noted.**
        // `generateSessions` falls back to `startOfToday()`, which reads the *server's* local
        // components, while this job fires on the *school's* clock. Today they agree only by
        // arithmetic: 04:30 in Bucharest is 01:30 or 02:30 UTC, the same calendar date either way.
        // Move the trigger to 01:00 — a perfectly reasonable thing for somebody to do — and the
        // server would compute yesterday, so the horizon would quietly start a day short and stay
        // that way. Naming the day on the school's clock makes the hour stop being load-bearing.
        const result = await this.classSessions.generateSessions({ weeks: DEFAULT_HORIZON_WEEKS, from: schoolDay(new Date()) });
        const summary: HorizonTopUp = { groups: result.groups, created: result.created, skipped: result.skipped };

        // Silent on the ordinary morning, which is every morning where nothing had lapsed. The
        // service already logs its own line with the dates; this one exists to make a top-up that
        // actually wrote something findable, and a log that speaks daily is a log nobody reads.
        if (summary.created > 0) {
            this.logger.log(`Extended the timetable by ${summary.created} session(s) across ${summary.groups} group(s).`);
        }

        return summary;
    }
}
