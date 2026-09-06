import { AttendanceType } from 'src/enum/attendance-type.enum';
import { ClassSessionStatus } from 'src/enum/class-session-status.enum';
import { EnrollmentStatus } from 'src/enum/enrollment-status.enum';
import { BillableEnrollment, BillableMark, BillableSession, billableSessionsFor, unmarkedSessions } from './billable-sessions.rules';

/**
 * The acceptance of E15/S9, case by case, with the school's own examples where it gave them.
 *
 * The group is "luni la 17:00" in September 2026, whose Mondays fall on the 7th, 14th, 21st and
 * 28th. Ana (1) comes every time, Radu (2) misses one, Maria (3) is on a trial.
 */
const session = (id: number, date: string, overrides: Partial<BillableSession> = {}): BillableSession => ({
    id,
    groupId: 10,
    date,
    isVacation: false,
    status: ClassSessionStatus.SCHEDULED,
    ...overrides,
});

const mark = (sessionId: number, childId: number, present: boolean, type = AttendanceType.REGULAR): BillableMark => ({
    sessionId,
    childId,
    present,
    type,
});

const enrolled = (childId: number, overrides: Partial<BillableEnrollment> = {}): BillableEnrollment => ({
    childId,
    groupId: 10,
    status: EnrollmentStatus.ACTIVE,
    startDate: '2026-09-01',
    endDate: null,
    ...overrides,
});

const MONDAYS = [session(1, '2026-09-07'), session(2, '2026-09-14'), session(3, '2026-09-21'), session(4, '2026-09-28')];

describe('billableSessionsFor', () => {
    it('a session with no register never happened, so nobody pays for it', () => {
        // Nobody marked the first Monday. Three held, so three each — including Radu, who missed one
        // of the three that were held.
        const marks = [mark(2, 1, true), mark(2, 2, true), mark(3, 1, true), mark(3, 2, false), mark(4, 1, true), mark(4, 2, true)];

        const counts = billableSessionsFor(MONDAYS, marks, [enrolled(1), enrolled(2)]);

        expect(counts.get(1)?.sessions).toBe(3);
        expect(counts.get(2)?.sessions).toBe(3);
    });

    it('a held session is billed to the whole group, present or absent', () => {
        // Radu is marked absent at every one of them. He still owes four: the seat was held.
        const marks = MONDAYS.flatMap((s) => [mark(s.id, 1, true), mark(s.id, 2, false)]);

        expect(billableSessionsFor(MONDAYS, marks, [enrolled(1), enrolled(2)]).get(2)?.sessions).toBe(4);
    });

    it('a register made entirely of absences still counts as held', () => {
        // The case the rule is built around: a class nobody came to is not a class nobody marked.
        const marks = [mark(1, 1, false), mark(1, 2, false)];

        const counts = billableSessionsFor([MONDAYS[0]], marks, [enrolled(1), enrolled(2)]);

        expect(counts.get(1)?.sessions).toBe(1);
        expect(counts.get(2)?.sessions).toBe(1);
    });

    it('a child with a mark on a session counts as held for the whole group, not just for them', () => {
        // The teacher marked only Ana. The session was held; Radu, unmarked, still owes it.
        const counts = billableSessionsFor([MONDAYS[0]], [mark(1, 1, true)], [enrolled(1), enrolled(2)]);

        expect(counts.get(2)?.sessions).toBe(1);
        expect(counts.get(2)?.lines[0]).toMatchObject({ present: null, counted: true });
    });

    describe('vacation sessions', () => {
        // December: two ordinary Mondays, two in the winter break, five children enrolled.
        const december = [
            session(11, '2026-12-07'),
            session(12, '2026-12-14'),
            session(13, '2026-12-21', { isVacation: true }),
            session(14, '2026-12-28', { isVacation: true }),
        ];
        const five = [1, 2, 3, 4, 5].map((id) => enrolled(id));

        it("are billed only to the children marked present — the school's own example", () => {
            const marks = [
                // Two came to the first, four to the second: the group is billed both regardless.
                mark(11, 1, true),
                mark(11, 2, true),
                mark(11, 3, false),
                mark(11, 4, false),
                mark(11, 5, false),
                ...[1, 2, 3, 4].map((child) => mark(12, child, true)),
                mark(12, 5, false),
                // Andrei (1) and Maria (2) came to both vacation sessions.
                mark(13, 1, true),
                mark(13, 2, true),
                mark(14, 1, true),
                mark(14, 2, true),
            ];

            const counts = billableSessionsFor(december, marks, five);

            expect(counts.get(1)?.sessions).toBe(4);
            expect(counts.get(2)?.sessions).toBe(4);
            expect(counts.get(3)?.sessions).toBe(2);
            expect(counts.get(4)?.sessions).toBe(2);
            expect(counts.get(5)?.sessions).toBe(2);
        });

        it('count per session, not per vacation — one hour attended out of two is one', () => {
            const marks = [mark(11, 1, true), mark(12, 1, true), mark(13, 1, true), mark(14, 1, false)];

            const counts = billableSessionsFor(december, marks, [enrolled(1)]);

            expect(counts.get(1)?.sessions).toBe(3);
            expect(counts.get(1)?.lines.map((line) => line.counted)).toEqual([true, true, true, false]);
        });

        it('an absent mark at a vacation session makes it held for others, and not billed to that child', () => {
            // Only Radu was marked, and marked absent. The session was held; he does not pay for it,
            // and Ana — unmarked — does not either, because it is a vacation.
            const marks = [mark(13, 2, false)];

            const counts = billableSessionsFor([december[2]], marks, [enrolled(1), enrolled(2)]);

            expect(counts.get(2)?.sessions).toBe(0);
            expect(counts.get(2)?.lines[0]).toMatchObject({ present: false, counted: false, isVacation: true });
            expect(counts.get(1)?.sessions).toBe(0);
        });

        it('cannot bill a child who is not otherwise billable', () => {
            // A trial child who dropped in on a vacation day: the tick adds on top of an enrolment
            // that is billed anyway, it cannot start a bill.
            const marks = [mark(13, 3, true)];

            expect(billableSessionsFor([december[2]], marks, [enrolled(3, { status: EnrollmentStatus.TRIAL })]).has(3)).toBe(false);
        });
    });

    describe('the enrolment period, not the group column', () => {
        it('a child enrolled on the 20th owes only what came after', () => {
            const marks = MONDAYS.flatMap((s) => [mark(s.id, 1, true), mark(s.id, 2, true)]);

            const counts = billableSessionsFor(MONDAYS, marks, [enrolled(1), enrolled(2, { startDate: '2026-09-20' })]);

            expect(counts.get(2)?.sessions).toBe(2);
            expect(counts.get(2)?.lines.map((line) => line.date)).toEqual(['2026-09-21', '2026-09-28']);
        });

        it('a child who left on the 15th still owes the sessions held while they were in', () => {
            // `WITHDRAWN`, not `ACTIVE` — and still billed for the two Mondays before the 15th. "Only
            // ACTIVE" in the spec means "not a trial", never "forgiven for leaving".
            const marks = MONDAYS.flatMap((s) => [mark(s.id, 1, true)]);

            const counts = billableSessionsFor(MONDAYS, marks, [enrolled(1, { status: EnrollmentStatus.WITHDRAWN, endDate: '2026-09-15' })]);

            expect(counts.get(1)?.sessions).toBe(2);
        });

        it('a child transferred mid-month pays each group for what was held while they were in it', () => {
            const python = [session(21, '2026-09-09', { groupId: 20 }), session(22, '2026-09-23', { groupId: 20 })];
            const marks = [mark(1, 1, true), mark(2, 1, true), mark(3, 9, true), mark(4, 9, true), mark(21, 9, true), mark(22, 1, true)];

            const counts = billableSessionsFor([...MONDAYS, ...python], marks, [
                enrolled(1, { status: EnrollmentStatus.TRANSFERRED, endDate: '2026-09-16' }),
                enrolled(1, { groupId: 20, startDate: '2026-09-17' }),
            ]);

            // Two Mondays in Scratch (7th, 14th), one Wednesday in Python (23rd). Not the 9th.
            expect(counts.get(1)?.sessions).toBe(3);
            expect(counts.get(1)?.lines.map((line) => line.date)).toEqual(['2026-09-07', '2026-09-14', '2026-09-23']);
        });

        it('a trial is never billed', () => {
            const marks = MONDAYS.flatMap((s) => [mark(s.id, 3, true)]);

            expect(billableSessionsFor(MONDAYS, marks, [enrolled(3, { status: EnrollmentStatus.TRIAL })]).has(3)).toBe(false);
        });

        it('an enrolled child with nothing held is still listed, at zero', () => {
            expect(billableSessionsFor(MONDAYS, [], [enrolled(1)]).get(1)).toEqual({ sessions: 0, lines: [] });
        });
    });

    describe('what never counts', () => {
        it('a make-up mark neither makes a session held nor bills the visitor', () => {
            // Child 7 was moved in from another group. Their mark is the only one on the session.
            const marks = [mark(1, 7, true, AttendanceType.MAKE_UP)];

            const counts = billableSessionsFor([MONDAYS[0]], marks, [enrolled(1), enrolled(7, { groupId: 30 })]);

            expect(counts.get(1)?.sessions).toBe(0);
            expect(counts.get(7)?.sessions).toBe(0);
        });

        it('a visitor on a vacation day is not billed twice', () => {
            const marks = [mark(13, 1, true), mark(13, 7, true, AttendanceType.MAKE_UP)];

            const counts = billableSessionsFor([session(13, '2026-12-21', { isVacation: true })], marks, [enrolled(1), enrolled(7, { groupId: 30 })]);

            expect(counts.get(7)?.sessions).toBe(0);
        });

        it('a cancelled session with a stray mark is still not billed', () => {
            const cancelled = session(1, '2026-09-07', { status: ClassSessionStatus.CANCELLED });

            expect(billableSessionsFor([cancelled], [mark(1, 1, true)], [enrolled(1)]).get(1)?.sessions).toBe(0);
        });
    });
});

describe('unmarkedSessions', () => {
    it('lists the sessions with no register, and not the cancelled ones', () => {
        const withCancelled = [...MONDAYS, session(5, '2026-09-30', { status: ClassSessionStatus.CANCELLED })];
        const marks = [mark(2, 1, true), mark(4, 2, false)];

        expect(unmarkedSessions(withCancelled, marks).map((s) => s.id)).toEqual([1, 3]);
    });

    it('a make-up mark alone does not make a session marked', () => {
        expect(unmarkedSessions([MONDAYS[0]], [mark(1, 7, true, AttendanceType.MAKE_UP)]).map((s) => s.id)).toEqual([1]);
    });
});
