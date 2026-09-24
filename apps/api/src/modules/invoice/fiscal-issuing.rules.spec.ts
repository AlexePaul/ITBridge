import { InvoiceFiscalStatus } from 'src/entities/invoice.entity';
import { fiscalBackoffFrom, fiscalStateAtIssue, servesLocalPdf } from './fiscal-issuing.rules';

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

    describe('servesLocalPdf', () => {
        it('draws the document for an invoice nothing fiscal exists for, in any mode', () => {
            for (const mode of ['off', 'draft', 'live'] as const) {
                expect(servesLocalPdf(null, mode)).toBe(true);
                expect(servesLocalPdf(InvoiceFiscalStatus.DRAFT, mode)).toBe(true);
            }
        });

        // E15/S7: the PDF is SmartBill's, and a second one with no series is not an invoice.
        it('never draws one beside a fiscal document that exists, or may', () => {
            for (const status of [InvoiceFiscalStatus.ISSUED, InvoiceFiscalStatus.UNCERTAIN, InvoiceFiscalStatus.REVIEW]) {
                expect(servesLocalPdf(status, 'draft')).toBe(false);
                expect(servesLocalPdf(status, 'live')).toBe(false);
            }
        });

        // What is still on its way becomes a draft in `draft` — the family had its PDF from the
        // moment of issue before E15/S6 — and a fiscal document in `live`, which is worth waiting for.
        it("draws one for an invoice on its way, except in 'live'", () => {
            for (const status of [InvoiceFiscalStatus.PENDING, InvoiceFiscalStatus.FAILED]) {
                expect(servesLocalPdf(status, 'off')).toBe(true);
                expect(servesLocalPdf(status, 'draft')).toBe(true);
                expect(servesLocalPdf(status, 'live')).toBe(false);
            }
        });
    });

    describe('fiscalBackoffFrom', () => {
        it('doubles from two minutes and stops at an hour', () => {
            const minutes = (attempts: number) => (fiscalBackoffFrom(now, attempts).getTime() - now.getTime()) / 60_000;
            expect([1, 2, 3, 4, 5, 6, 7].map(minutes)).toEqual([2, 4, 8, 16, 32, 60, 60]);
        });
    });
});
