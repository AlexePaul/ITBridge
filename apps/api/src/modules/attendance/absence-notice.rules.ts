import { ClassSession } from 'src/entities/class-session.entity';
import { startOfIsoWeek, toIsoDate } from 'src/modules/class-session/class-session.dates';
import { SCHOOL_TIME_ZONE, schoolLocalStamp } from 'src/common/school-clock';

/**
 * Re-exported, not redefined: the clock itself now lives in `src/common/school-clock.ts`, because a
 * third caller outside attendance needed it. The rule that uses it stays here.
 */
export { SCHOOL_TIME_ZONE, schoolLocalStamp };

/** The same stamp for a session's own start, built from its stored local components. */
export function sessionStartStamp(session: Pick<ClassSession, 'date' | 'startTime'>): string {
    return `${toIsoDate(session.date)}T${session.startTime.slice(0, 5)}`;
}

/**
 * The hour on Monday by which the week's absences have to be known.
 *
 * Noon, not the start of the day: the office reads what came in over the weekend on Monday morning,
 * and the deadline is the moment it stops reading and starts moving children between groups.
 */
export const NOTICE_DEADLINE_HOUR = '12:00';

/** Monday noon of the week `session` falls in, as a sortable school-clock stamp. */
export function noticeDeadlineFor(session: Pick<ClassSession, 'date'>): string {
    const monday = startOfIsoWeek(new Date(`${toIsoDate(session.date)}T00:00:00`));
    return `${toIsoDate(monday)}T${NOTICE_DEADLINE_HOUR}`;
}

/**
 * When a notice still counts — E12/S3.
 *
 * **The rule: Monday, 12:00, for the whole week.** It is not a per-class threshold. Announcing is
 * not there to warn the teacher about to walk into the room — it is there so the office can move
 * the child into another group *in the same week*, and that planning happens once, on Monday. A
 * notice arriving Wednesday for a Wednesday class has missed nothing the teacher needed and
 * everything the office did.
 *
 * The consequence is deliberately hard and was chosen knowing it: a child who wakes up ill on
 * Wednesday earns no make-up. The school's answer is the one it gives about the fee itself — the
 * seat was held and the teacher was in the room, so the month costs the same, and what a family
 * buys by telling us early is the chance to move, not a discount. `canBackfill` below is the only
 * give in the rule, and it is aimed at the office's own forgetfulness, not at the deadline.
 *
 * The school has no Monday-morning group, so noon on Monday always falls before every class of its
 * own week. If one is ever added, this rule quietly stops being satisfiable for it, and this is the
 * line to change.
 *
 * Times are compared in the school's own terms: the session carries a local date and a local
 * `HH:mm:ss`, and `now` is read through the same timezone. Comparing a `date` column against a UTC
 * instant is the trap `class-session.dates.ts` exists to avoid, one time zone away from being an
 * off-by-one-day bug.
 *
 * True when the notice arrived before its week's Monday noon. Text comparison, both in school time.
 */
export function isInTime(session: Pick<ClassSession, 'date'>, now: Date): boolean {
    return schoolLocalStamp(now) < noticeDeadlineFor(session);
}

/**
 * Whether a notice recorded after the deadline still earns the move — E12/S3.
 *
 * **Only the office forgets; the family is never the reason this exists.** Parents tell the school
 * by phone, WhatsApp or email, and somebody has to type that in. When nobody does, a family that
 * did everything asked of them loses the week to a delay that was never theirs.
 *
 * The window closes when the replacement class starts, and that bound is the whole rule. Before it,
 * moving the child is still a real thing to arrange; after it, the class has happened and recording
 * the move would be writing down something that never occurred. It also cannot be stretched: the
 * target session is named when the notice is backfilled, so the deadline is a property of the class
 * being offered rather than a period somebody picks.
 */
export function canBackfill(replacement: Pick<ClassSession, 'date' | 'startTime'>, now: Date): boolean {
    return schoolLocalStamp(now) < sessionStartStamp(replacement);
}
