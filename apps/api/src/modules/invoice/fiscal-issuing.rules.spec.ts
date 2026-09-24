import { InvoiceFiscalStatus } from 'src/entities/invoice.entity';
import { fiscalBackoffFrom, fiscalStateAtIssue, writesLocalPdf } from './fiscal-issuing.rules';

describe('fiscal issuing rules', () => {
    const now = new Date('2026-11-01T09:00:00Z');

    describe('fiscalStateAtIssue', () => {
        it('queues an invoice with money on it, in a mode that sends', () => {
            expect(fiscalStateAtIssue(175, 'live', now)).toEqual({ fiscalStatus: InvoiceFiscalStatus.PENDING, fiscalNextAttemptAt: now });
            expect(fiscalStateAtIssue(175, 'draft', now).fiscalStatus).toBe(InvoiceFiscalStatus.PENDING);
        });

        // A waived month has no document by design (E15): nothing to print, nobody to ask for money.
        it('leaves a waived month out of the queue', () => {
            expect(fiscalStateAtIssue(0, 'live', now)).toEqual({ fiscalStatus: null, fiscalNextAttemptAt: null });
        });

        it("leaves everything out in 'off' — the invoice was never meant for SmartBill", () => {
            expect(fiscalStateAtIssue(175, 'off', now)).toEqual({ fiscalStatus: null, fiscalNextAttemptAt: null });
        });
    });

    describe('writesLocalPdf', () => {
        // E15/S7: in live the PDF is SmartBill's, and a second one with no series is not an invoice.
        it("stops only in 'live'", () => {
            expect(writesLocalPdf('off')).toBe(true);
            expect(writesLocalPdf('draft')).toBe(true);
            expect(writesLocalPdf('live')).toBe(false);
        });
    });

    describe('fiscalBackoffFrom', () => {
        it('doubles from two minutes and stops at an hour', () => {
            const minutes = (attempts: number) => (fiscalBackoffFrom(now, attempts).getTime() - now.getTime()) / 60_000;
            expect([1, 2, 3, 4, 5, 6, 7].map(minutes)).toEqual([2, 4, 8, 16, 32, 60, 60]);
        });
    });
});
