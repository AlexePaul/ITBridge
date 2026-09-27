import { monthIsTaught } from '../modules/invoice/billing-period.rules';
import { seededInvoiceMonths } from './seed-months';

describe('seededInvoiceMonths', () => {
    it('invoices the two months before the latest finished one, and leaves that one to issue', () => {
        // On 27 September 2026 August is finished (its last week ended on 6 September) and September
        // is not (its last week ends on 4 October): August is the month the test plan issues.
        expect(seededInvoiceMonths('2026-09-27')).toEqual([
            { month: '2026-07', issuedOn: '2026-08-05' },
            { month: '2026-06', issuedOn: '2026-07-08' },
        ]);
    });

    it('moves on once the current month is finished', () => {
        expect(seededInvoiceMonths('2026-10-04').map((m) => m.month)).toEqual(['2026-07', '2026-06']);
        expect(seededInvoiceMonths('2026-10-05').map((m) => m.month)).toEqual(['2026-08', '2026-07']);
    });

    it('crosses a year', () => {
        expect(seededInvoiceMonths('2027-02-10').map((m) => m.month)).toEqual(['2026-12', '2026-11']);
    });

    it('never invoices a month the issuing screen would refuse, nor dates one before it was finished', () => {
        for (const seedDay of ['2026-09-01', '2026-09-27', '2026-10-05', '2026-12-31', '2027-03-02']) {
            for (const { month, issuedOn } of seededInvoiceMonths(seedDay)) {
                expect(monthIsTaught(month, issuedOn)).toBe(true);
                expect(issuedOn <= seedDay).toBe(true);
            }
        }
    });
});
