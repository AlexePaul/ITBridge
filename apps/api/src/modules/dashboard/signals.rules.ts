/**
 * The early signals — E21/S7 — as pure rules.
 *
 * Each signal is a pattern that tends to come before a problem the school would otherwise notice
 * in the money, weeks later: a child who has stopped coming, a group whose room is emptier every
 * week, a family two invoices behind. The thresholds are **proposals**, like the occupancy line in
 * `reports.rules.ts`: the story names the patterns and nobody has yet said where the line sits.
 * Each one is a constant here, read by the screen so it can name the line it draws, and changed in
 * one edit rather than a hunt.
 *
 * Pure on purpose. Marks, sessions and invoices in; who is flagged out. The service decides which
 * rows belong to the window and hands them over; this file decides what they mean. That is what
 * lets the rule be read, and tested, on a history typed by hand — which is also the only way the
 * story's acceptance ("verificat retroactiv") can be met before there is any real history at all.
 */

/** A child whose last this-many marks are all absences is flagged. */
export const CHILD_ABSENCE_STREAK = 3;

/**
 * A streak is only news while it is live. A child whose last mark is older than this has left
 * (or the register stopped), and flagging them forever would bury the ones still on the roll.
 */
export const STALE_STREAK_AFTER_DAYS = 21;

/** How many held sessions make one window when a group's attendance is compared with its own past. */
export const GROUP_ATTENDANCE_WINDOW = 3;

/** The fall in attendance rate — recent window against the one before — at which a group is flagged. */
export const GROUP_ATTENDANCE_DROP = 0.2;

/** A family with this many invoices past their due date is flagged. */
export const FAMILY_OVERDUE_INVOICES = 2;

/** How far back the attendance signals read. Three months holds any streak that is still live. */
export const SIGNALS_LOOKBACK_DAYS = 90;

/** One mark, as the streak rule needs it. `date` is the session's, `YYYY-MM-DD`. */
export interface Mark {
    date: string;
    present: boolean;
}

/**
 * The trailing run of absences — how many marks from the end are absences, before the first
 * presence. Marks are taken in date order; the caller sorts.
 */
export function absenceStreak(marks: Mark[]): number {
    let streak = 0;
    for (let index = marks.length - 1; index >= 0; index -= 1) {
        if (marks[index].present) break;
        streak += 1;
    }
    return streak;
}

/** The date of the first absence in the trailing run, or `null` when the last mark is a presence. */
export function streakSince(marks: Mark[]): string | null {
    const streak = absenceStreak(marks);
    if (streak === 0) return null;
    return marks[marks.length - streak].date;
}

/** Days between two `YYYY-MM-DD` keys, `to` minus `from`. Through UTC on purpose: both are already days. */
export function daysBetween(from: string, to: string): number {
    const asUtc = (key: string) => Date.parse(`${key}T00:00:00Z`);
    return Math.round((asUtc(to) - asUtc(from)) / 86_400_000);
}

/**
 * Whether a child's marks say "stopped coming": a live streak at least `streak` long, whose last
 * mark is no older than `staleAfterDays` before `asOf`.
 */
export function isAbsenceSignal(marks: Mark[], asOf: string, streak = CHILD_ABSENCE_STREAK, staleAfterDays = STALE_STREAK_AFTER_DAYS): boolean {
    if (marks.length === 0) return false;
    if (absenceStreak(marks) < streak) return false;
    return daysBetween(marks[marks.length - 1].date, asOf) <= staleAfterDays;
}

/** One held session of a group: how many were marked, how many of them present. */
export interface SessionRate {
    date: string;
    present: number;
    marked: number;
}

/** Present over marked, two decimals. A session with no marks has no rate — it was not held. */
export function rateOf(session: SessionRate): number {
    if (session.marked <= 0) return 0;
    return Math.round((session.present / session.marked) * 100) / 100;
}

export interface AttendanceTrend {
    /** Mean rate over the last `window` sessions. */
    recent: number;
    /** Mean rate over the `window` sessions before those. */
    previous: number;
    /** `previous - recent`, two decimals. Positive when attendance fell. */
    drop: number;
    /** How many sessions were read: always `2 × window`. */
    sessions: number;
    /** The last session's date. */
    lastSessionOn: string;
}

/**
 * A group's attendance now against its own recent past — `null` until there are two full windows.
 *
 * Mean of per-session rates rather than pooled counts, so a session with a visitor or two does
 * not weigh more than one without. Sessions are taken in date order; the caller sorts.
 */
export function attendanceTrend(sessions: SessionRate[], window = GROUP_ATTENDANCE_WINDOW): AttendanceTrend | null {
    if (window <= 0 || sessions.length < window * 2) return null;
    const recentRows = sessions.slice(-window);
    const previousRows = sessions.slice(-window * 2, -window);
    const mean = (rows: SessionRate[]) => Math.round((rows.reduce((sum, row) => sum + rateOf(row), 0) / rows.length) * 100) / 100;
    const recent = mean(recentRows);
    const previous = mean(previousRows);
    return {
        recent,
        previous,
        drop: Math.round((previous - recent) * 100) / 100,
        sessions: window * 2,
        lastSessionOn: sessions[sessions.length - 1].date,
    };
}

/** Whether a trend is a fall worth a phone call. */
export function isDecliningTrend(trend: AttendanceTrend | null, drop = GROUP_ATTENDANCE_DROP): boolean {
    return trend !== null && trend.drop >= drop;
}

/** One unsettled invoice, as `ArrearsService.list` describes it — only the fields the rule reads. */
export interface OverdueInvoice {
    parentId: number;
    daysOverdue: number;
    outstanding: number;
}

export interface FamilyOverdue {
    parentId: number;
    /** Invoices past their due date — `due_soon` ones are not counted. */
    invoices: number;
    outstanding: number;
    oldestDaysOverdue: number;
}

/**
 * The families with at least `minimum` invoices past due, largest debt first.
 *
 * "Past due" is `daysOverdue > 0`, which is the arrears service's own definition of the `overdue`
 * bucket and up. An invoice still inside its fourteen days is a normal invoice, not a signal.
 */
export function familiesInArrears(rows: OverdueInvoice[], minimum = FAMILY_OVERDUE_INVOICES): FamilyOverdue[] {
    const byParent = new Map<number, FamilyOverdue>();
    for (const row of rows) {
        if (row.daysOverdue <= 0) continue;
        const entry = byParent.get(row.parentId) ?? { parentId: row.parentId, invoices: 0, outstanding: 0, oldestDaysOverdue: 0 };
        entry.invoices += 1;
        entry.outstanding = Math.round((entry.outstanding + row.outstanding) * 100) / 100;
        entry.oldestDaysOverdue = Math.max(entry.oldestDaysOverdue, row.daysOverdue);
        byParent.set(row.parentId, entry);
    }
    return [...byParent.values()]
        .filter((entry) => entry.invoices >= minimum)
        .sort((a, b) => b.outstanding - a.outstanding || b.oldestDaysOverdue - a.oldestDaysOverdue || a.parentId - b.parentId);
}
