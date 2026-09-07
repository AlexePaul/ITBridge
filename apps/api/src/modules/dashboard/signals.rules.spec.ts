import { absenceStreak, attendanceTrend, daysBetween, familiesInArrears, isAbsenceSignal, isDecliningTrend, rateOf, streakSince } from './signals.rules';

/**
 * The early-signal rules on histories typed by hand — E21/S7.
 *
 * This is the story's "verificat retroactiv" before there is any real history to verify against:
 * a child who then stops coming, a group that empties over six weeks, a family that lets two
 * invoices go. Each rule is asked whether it would have said something in time.
 */
describe('signals rules', () => {
    const mark = (date: string, present: boolean) => ({ date, present });

    describe('absence streak', () => {
        it('counts absences from the end back to the last presence', () => {
            const marks = [mark('2026-03-02', true), mark('2026-03-09', false), mark('2026-03-16', false), mark('2026-03-23', false)];

            expect(absenceStreak(marks)).toBe(3);
            expect(streakSince(marks)).toBe('2026-03-09');
        });

        it('is zero after a presence, whatever came before it', () => {
            const marks = [mark('2026-03-02', false), mark('2026-03-09', false), mark('2026-03-16', false), mark('2026-03-23', true)];

            expect(absenceStreak(marks)).toBe(0);
            expect(streakSince(marks)).toBeNull();
        });

        it('counts a history of absences only, from its first day', () => {
            const marks = [mark('2026-03-02', false), mark('2026-03-09', false)];

            expect(absenceStreak(marks)).toBe(2);
            expect(streakSince(marks)).toBe('2026-03-02');
        });

        it('is nothing on no marks', () => {
            expect(absenceStreak([])).toBe(0);
            expect(streakSince([])).toBeNull();
        });
    });

    describe('the child signal', () => {
        const threeInARow = [mark('2026-03-02', true), mark('2026-03-09', false), mark('2026-03-16', false), mark('2026-03-23', false)];

        it('fires on three absences in a row, while the streak is live', () => {
            expect(isAbsenceSignal(threeInARow, '2026-03-30')).toBe(true);
        });

        it('would have said nothing a week earlier — two is not yet a pattern', () => {
            expect(isAbsenceSignal(threeInARow.slice(0, 3), '2026-03-23')).toBe(false);
        });

        it('goes quiet once the last mark is three weeks old — the child has left, or the register stopped', () => {
            expect(isAbsenceSignal(threeInARow, '2026-04-13')).toBe(true);
            expect(isAbsenceSignal(threeInARow, '2026-04-14')).toBe(false);
        });

        it('is nothing for a child with no marks', () => {
            expect(isAbsenceSignal([], '2026-03-30')).toBe(false);
        });

        it('takes another streak length when asked', () => {
            expect(isAbsenceSignal(threeInARow, '2026-03-30', 4)).toBe(false);
            expect(isAbsenceSignal(threeInARow, '2026-03-30', 2)).toBe(true);
        });
    });

    describe('days between', () => {
        it('counts calendar days, across the clock change too', () => {
            expect(daysBetween('2026-03-23', '2026-03-30')).toBe(7);
            expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
            expect(daysBetween('2026-03-30', '2026-03-23')).toBe(-7);
        });
    });

    describe('attendance trend', () => {
        const session = (date: string, present: number, marked = 8) => ({ date, present, marked });
        const sixWeeks = [
            session('2026-02-16', 8),
            session('2026-02-23', 7),
            session('2026-03-02', 8),
            session('2026-03-09', 6),
            session('2026-03-16', 5),
            session('2026-03-23', 4),
        ];

        it('gives a session its share present, two decimals, and no rate to an unmarked one', () => {
            expect(rateOf(session('2026-03-02', 7))).toBe(0.88);
            expect(rateOf(session('2026-03-02', 0, 0))).toBe(0);
        });

        it('compares the last three sessions with the three before them', () => {
            const trend = attendanceTrend(sixWeeks);

            expect(trend).toEqual({ recent: 0.63, previous: 0.96, drop: 0.33, sessions: 6, lastSessionOn: '2026-03-23' });
            expect(isDecliningTrend(trend)).toBe(true);
        });

        it('reads only the last two windows when there is more history', () => {
            const trend = attendanceTrend([session('2026-02-09', 1), ...sixWeeks]);

            expect(trend?.previous).toBe(0.96);
            expect(trend?.recent).toBe(0.63);
        });

        it('says nothing until there are two full windows', () => {
            expect(attendanceTrend(sixWeeks.slice(1))).toBeNull();
            expect(isDecliningTrend(null)).toBe(false);
        });

        it('does not flag a steady group, or one that is recovering', () => {
            const steady = sixWeeks.map((row) => ({ ...row, present: 7 }));
            expect(isDecliningTrend(attendanceTrend(steady))).toBe(false);

            const recovering = [...sixWeeks].reverse().map((row, index) => ({ ...row, date: sixWeeks[index].date }));
            expect(attendanceTrend(recovering)?.drop).toBeLessThan(0);
            expect(isDecliningTrend(attendanceTrend(recovering))).toBe(false);
        });

        it('sits exactly on the line: a fall of the threshold itself is flagged, one point under is not', () => {
            expect(isDecliningTrend({ recent: 0.7, previous: 0.9, drop: 0.2, sessions: 6, lastSessionOn: '2026-03-23' })).toBe(true);
            expect(isDecliningTrend({ recent: 0.71, previous: 0.9, drop: 0.19, sessions: 6, lastSessionOn: '2026-03-23' })).toBe(false);
        });
    });

    describe('families in arrears', () => {
        it('flags a family with two invoices past due, and sums what they owe', () => {
            const families = familiesInArrears([
                { parentId: 1, daysOverdue: 45, outstanding: 350 },
                { parentId: 1, daysOverdue: 15, outstanding: 350 },
                { parentId: 2, daysOverdue: 40, outstanding: 600 },
            ]);

            expect(families).toEqual([{ parentId: 1, invoices: 2, outstanding: 700, oldestDaysOverdue: 45 }]);
        });

        it('does not count an invoice still inside its fourteen days', () => {
            const families = familiesInArrears([
                { parentId: 1, daysOverdue: 45, outstanding: 350 },
                { parentId: 1, daysOverdue: 0, outstanding: 350 },
            ]);

            expect(families).toEqual([]);
        });

        it('puts the largest debt first', () => {
            const families = familiesInArrears([
                { parentId: 1, daysOverdue: 20, outstanding: 100 },
                { parentId: 1, daysOverdue: 50, outstanding: 100 },
                { parentId: 2, daysOverdue: 20, outstanding: 600 },
                { parentId: 2, daysOverdue: 21, outstanding: 600 },
            ]);

            expect(families.map((family) => family.parentId)).toEqual([2, 1]);
        });
    });
});
