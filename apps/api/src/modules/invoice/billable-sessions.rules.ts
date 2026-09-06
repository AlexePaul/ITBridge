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
 * Two things are deliberately *not* here:
 *
 * - **A trial is never billed.** Only enrolments that are not `TRIAL` count. The spec says "only
 *   `ACTIVE`", and it means it as "not a trial": a child withdrawn on the 20th is `WITHDRAWN`, not
 *   `ACTIVE`, and still owes the sessions held before the 20th — "what was held while their
 *   enrolment was in force" is the period rule, and the status rule exists to keep trials out of
 *   it, not to forgive a family for leaving.
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

/** True when `date` falls inside the enrolment, both ends inclusive. Strings, compared as strings. */
function covers(enrollment: BillableEnrollment, date: string): boolean {
    return enrollment.startDate <= date && (enrollment.endDate === null || date <= enrollment.endDate);
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
    for (const enrollment of enrollments) {
        if (enrollment.status === EnrollmentStatus.TRIAL) continue;

        const entry = counts.get(enrollment.childId) ?? { sessions: 0, lines: [] };
        for (const session of byGroup.get(enrollment.groupId) ?? []) {
            if (!covers(enrollment, session.date)) continue;
            const presentChildren = held.get(session.id)!;
            const present = presentChildren.has(enrollment.childId)
                ? true
                : marks.some((mark) => mark.sessionId === session.id && mark.childId === enrollment.childId && mark.type === AttendanceType.REGULAR)
                  ? false
                  : null;
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
