import { addMonthsToDay, erasureDueOn, FAMILY_RETENTION_MONTHS, holdOf, keptSince } from './retention.rules';

describe('retention rules', () => {
    describe('addMonthsToDay', () => {
        it('moves by calendar months, across the year', () => {
            expect(addMonthsToDay('2026-03-15', 12)).toBe('2027-03-15');
            expect(addMonthsToDay('2026-11-30', 3)).toBe('2027-02-28');
            expect(addMonthsToDay('2027-01-10', -12)).toBe('2026-01-10');
            expect(addMonthsToDay('2027-01-10', -1)).toBe('2026-12-10');
        });

        // Where `Date` would roll over into the next month and move the due day by up to three days.
        it('clamps to the end of a shorter month instead of rolling into the next one', () => {
            expect(addMonthsToDay('2027-03-31', -1)).toBe('2027-02-28');
            expect(addMonthsToDay('2027-03-31', 11)).toBe('2028-02-29');
            expect(addMonthsToDay('2028-02-29', 12)).toBe('2029-02-28');
            expect(addMonthsToDay('2026-01-31', 3)).toBe('2026-04-30');
        });

        it('reads a timestamp as its day', () => {
            expect(addMonthsToDay('2026-03-15T22:30:00.000Z', 1)).toBe('2026-04-15');
        });
    });

    it('puts a withdrawn family due on the same day, the configured number of months later', () => {
        expect(FAMILY_RETENTION_MONTHS).toBe(12);
        expect(erasureDueOn('2026-06-30')).toBe('2027-06-30');
    });

    it('keeps what happened on or after the same day, that many months ago', () => {
        expect(keptSince('2027-06-30', 12)).toBe('2026-06-30');
    });

    describe('holdOf', () => {
        const clear = { enrolmentsInForce: 0, openWaitlistEntries: 0, outstanding: 0, invoicesOnTheirWayToSmartBill: 0 };

        it('holds nothing for a family that is gone and owes nothing', () => {
            expect(holdOf(clear)).toBeNull();
        });

        it('names what still ties the family to the school, the open place first', () => {
            expect(holdOf({ ...clear, enrolmentsInForce: 1, outstanding: 350 })).toBe('enrolment_in_force');
            expect(holdOf({ ...clear, openWaitlistEntries: 1 })).toBe('on_waitlist');
            expect(holdOf({ ...clear, outstanding: 0.01 })).toBe('owes_money');
        });

        it('holds a family whose invoice is still on its way to SmartBill, paid or not', () => {
            expect(holdOf({ ...clear, invoicesOnTheirWayToSmartBill: 1 })).toBe('fiscal_in_progress');
            expect(holdOf({ ...clear, outstanding: 350, invoicesOnTheirWayToSmartBill: 1 })).toBe('owes_money');
        });
    });
});
