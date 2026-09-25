import { AttendanceType } from 'src/enum/attendance-type.enum';
import { ClassSessionStatus } from 'src/enum/class-session-status.enum';
import { EnrollmentStatus } from 'src/enum/enrollment-status.enum';

/**
 * How many sessions each child is billed for in a month — E15/S9, the rule itself.
 *
 * **Pure.** Sessions, marks and enrolments in; a number per child out. No repository, no clock, no
 * month arithmetic — the caller (`BillableSessionsService`) decides which rows belong to the month
 * and hands them over, and this file decides what they are worth. Kept apart from the query so the
 * rule can be read, and tested, without a database; kept in one place so there is exactly one
 * answer to "how many did this child have", and the screen, the invoice and the reports all get
 * the same one.
 *
 * The rule, in the school's words:
 *
 * - **A session was held if it has a register.** One mark — present *or* absent — is the signal. A
 *   session nobody marked did not happen, so nobody pays for it. A register made entirely of
 *   absences still counts: somebody stood in the room and answered "who came", and "nobody" is an
 *   answer. That is the only thing that lets a forgotten register be told apart from a bad day.
 * - **A held session is billed to the whole group.** The child who missed it pays the same as the
 *   child who came: the seat was held and the teacher was there. What they get instead is a move
 *   to another group that week (E12/S4), not a smaller invoice.
 * - **A vacation session is billed only to the children who came.** The tick is on the session
 *   (E12/S8), put there by whoever took the register. The school runs the hour for whoever wants
 *   it, and a child who stayed home is not charged for an hour nobody asked them to attend.
 *
 * - **The days an enrolment starts and ends are shared, and the register settles them.** A row
 *   written today — an enrolment, a transfer, a withdrawal — says nothing about which side of this
 *   evening's class the change fell on. So a session on either day counts only if the child is on
 *   its register, marked present or absent: the register lists the group as it stood when it was
 *   taken. A family who withdrew on Monday morning is not billed for Monday's class, and one who
 *   said at pickup that it was the last is; a child moved to another group after its class is not
 *   billed for the new group's class held that morning. Days strictly inside the period follow the
 *   first rule, register or not — a child withdrawn on the 20th still owes what was held before.
 *   Two rows that both reach a session (a child taken out and put back the same day) bill it once.
 *
 * Two things are deliberately *not* here:
 *
 * - **A trial is never billed.** Only enrolments that are not `TRIAL` count, and a row that stopped
 *   being a trial counts only after `trialUntil`, the day of the decision. The spec says "only
 *   `ACTIVE`", and it means it as "not a trial": a child withdrawn on the 20th is `WITHDRAWN`, not
 *   `ACTIVE`, and still owes the sessions held before the 20th — "what was held while their
 *   enrolment was in force" is the period rule, and the status rule exists to keep trials out of
 *   it, not to forgive a family for leaving. Reading the status alone did not: a trial accepted on
 *   the same row, declined, or moved to another group stopped being `TRIAL`, and its free class
 *   was billed — the review of 25 September 2026. The decision day is free whole, even when the
 *   office decides before that day's class: charging a class the family was promised free is the
 *   worse of the two mistakes.
 * - **A make-up mark never counts.** A child the office moved into another group for a week
 *   carries `AttendanceType.MAKE_UP` there, and is already paying for the hour in their own group.
 *   Only `REGULAR` marks are read, so a visitor on a vacation day is not billed twice.
 */

export interface BillableSession {
    id: number;
    groupId: number;
    /** `YYYY-MM-DD`, local — never a `Date` that went through UTC. */
    date: string;
    isVacation: boolean;
    status: ClassSessionStatus;
}

export interface BillableMark {
    sessionId: number;
    childId: number;
    present: boolean;
    type: AttendanceType;
}

export interface BillableEnrollment {
    childId: number;
    groupId: number;
    status: EnrollmentStatus;
    startDate: string;
    endDate: string | null;
    /** The day this row stopped being a trial; nothing up to and including it is billed. */
    trialUntil: string | null;
}

/** One held session of a child's group, and whether it counts for them — what the screen unfolds. */
export interface BillableLine {
    sessionId: number;
    date: string;
    isVacation: boolean;
    /** The child's own mark at that session; `null` when the register has no row for them. */
    present: boolean | null;
    /** False only for a vacation session the child was not marked present at. */
    counted: boolean;
}

export interface BillableCount {
    /** The number that reaches `amountForSessions`. */
    sessions: number;
    lines: BillableLine[];
}

/**
 * Sessions that have a register, keyed by id, with the set of children marked present at each.
 *
 * Only `REGULAR` marks are read, and only `present` ones are kept: a mark's existence is what makes
 * a session held, and a mark's `present` is what makes a vacation session count for that child. An
 * absent mark contributes to the first and not the second, which is the whole of the rule.
 */
function heldSessions(sessions: BillableSession[], marks: BillableMark[]): Map<number, Set<number>> {
    const marked = new Map<number, Set<number>>();
    for (const mark of marks) {
        if (mark.type !== AttendanceType.REGULAR) continue;
        const present = marked.get(mark.sessionId) ?? new Set<number>();
        if (mark.present) present.add(mark.childId);
        marked.set(mark.sessionId, present);
    }

    const held = new Map<number, Set<number>>();
    for (const session of sessions) {
        // A cancelled session cannot have marks — the register refuses it — but the check costs
        // nothing and says in code what the spec says in prose.
        if (session.status === ClassSessionStatus.CANCELLED) continue;
        const present = marked.get(session.id);
        if (present) held.set(session.id, present);
    }
    return held;
}

/**
 * Whether a session on `date` is billed to this enrolment. Strings, compared as strings.
 *
 * Inside the period it is; on the first or the last day only if the child is on the session's
 * register (`onRegister`), because those days are shared with the state before and after; up to
 * and including the day a trial was decided, never.
 */
function covers(enrollment: BillableEnrollment, date: string, onRegister: boolean): boolean {
    if (enrollment.trialUntil !== null && date <= enrollment.trialUntil) return false;
    if (date < enrollment.startDate) return false;
    if (enrollment.endDate !== null && date > enrollment.endDate) return false;
    const sharedDay = date === enrollment.startDate || date === enrollment.endDate;
    return !sharedDay || onRegister;
}

/**
 * The count per child.
 *
 * Every child with a non-trial enrolment among `enrollments` gets an entry, even one with no held
 * session — the worksheet lists them, at zero, so a family with two children is shown both.
 */
export function billableSessionsFor(sessions: BillableSession[], marks: BillableMark[], enrollments: BillableEnrollment[]): Map<number, BillableCount> {
    const held = heldSessions(sessions, marks);
    const byGroup = new Map<number, BillableSession[]>();
    for (const session of sessions) {
        if (!held.has(session.id)) continue;
        byGroup.set(session.groupId, [...(byGroup.get(session.groupId) ?? []), session]);
    }

    const counts = new Map<number, BillableCount>();
    // Per child, the sessions already on their lines: two rows that both reach one session — taken
    // out of a group and put back on the same day — must bill it once, not twice.
    const reached = new Map<number, Set<number>>();
    for (const enrollment of enrollments) {
        if (enrollment.status === EnrollmentStatus.TRIAL) continue;

        const entry = counts.get(enrollment.childId) ?? { sessions: 0, lines: [] };
        const seen = reached.get(enrollment.childId) ?? new Set<number>();
        reached.set(enrollment.childId, seen);
        for (const session of byGroup.get(enrollment.groupId) ?? []) {
            if (seen.has(session.id)) continue;
            const presentChildren = held.get(session.id)!;
            const present = presentChildren.has(enrollment.childId)
                ? true
                : marks.some((mark) => mark.sessionId === session.id && mark.childId === enrollment.childId && mark.type === AttendanceType.REGULAR)
                  ? false
                  : null;
            if (!covers(enrollment, session.date, present !== null)) continue;
            seen.add(session.id);
            const counted = !session.isVacation || present === true;
            entry.lines.push({ sessionId: session.id, date: session.date, isVacation: session.isVacation, present, counted });
            if (counted) entry.sessions += 1;
        }
        counts.set(enrollment.childId, entry);
    }

    for (const entry of counts.values()) {
        entry.lines.sort((a, b) => a.date.localeCompare(b.date) || a.sessionId - b.sessionId);
    }
    return counts;
}

/**
 * The month's sessions with no register — the money that is not being asked for.
 *
 * Shown above the worksheet rather than folded into it, because a missing register is not a
 * property of any family: it is 87,50 lei of every child in the group, and it is the one thing the
 * person about to press the button must see first. Cancelled sessions are not unmarked, they are
 * cancelled — that is the explicit door for an hour that really did not happen.
 */
export function unmarkedSessions(sessions: BillableSession[], marks: BillableMark[]): BillableSession[] {
    const held = heldSessions(sessions, marks);
    return sessions.filter((session) => session.status !== ClassSessionStatus.CANCELLED && !held.has(session.id));
}
