import { InvoiceFiscalStatus } from 'src/entities/invoice.entity';
import { paymentReference } from 'src/modules/invoice/payment-reference';
import { namesInvoice, normalizeText, suggestMatch, withRunningRemainder, type MatchSuggestion, type OpenInvoice } from './statement-matching.rules';

/** Which invoice a statement line pays — E16/S8. A proposal, never a decision. */
describe('statement matching', () => {
    /** The references the email prints, from the function that prints them — not a copy of their shape. */
    const fiscal = (fiscalNumber: string) => paymentReference({ id: 0, fiscalSeries: 'ITB', fiscalNumber, fiscalStatus: InvoiceFiscalStatus.ISSUED }, 'live');
    const platform = (id: number) => paymentReference({ id, fiscalSeries: null, fiscalNumber: null, fiscalStatus: null }, 'off');

    const invoice = (overrides: Omit<Partial<OpenInvoice>, 'family'> & { family?: Partial<OpenInvoice['family']> } = {}): OpenInvoice => {
        const { family, ...rest } = overrides;
        return {
            invoiceId: 1,
            monthIssued: '2026-10',
            outstanding: 350,
            reference: fiscal('0041'),
            ...rest,
            family: { parentId: 10, firstName: 'Ana', lastName: 'Popescu', ...family },
        };
    };

    describe('namesInvoice', () => {
        it('knows the reference however the family typed it', () => {
            for (const typed of ['plata ITB 0041', 'ITB0041', 'itb-41', 'Factura ITB 41.', 'ITB/0041 octombrie']) {
                expect(namesInvoice(normalizeText(typed), 'ITB', '0041')).toBe(true);
            }
        });

        it('does not take another number for it', () => {
            expect(namesInvoice(normalizeText('ITB 410'), 'ITB', '0041')).toBe(false);
            expect(namesInvoice(normalizeText('ITB 1041'), 'ITB', '0041')).toBe(false);
            expect(namesInvoice(normalizeText('XITB 41'), 'ITB', '0041')).toBe(false);
        });
    });

    describe('suggestMatch', () => {
        it('matches by the fiscal reference, whoever paid', () => {
            const open = [invoice(), invoice({ invoiceId: 2, reference: fiscal('0042'), family: { parentId: 11, lastName: 'Ionescu' } })];

            expect(suggestMatch({ amount: 350, description: 'plata ITB 0042', counterparty: 'BUNICA MARIA' }, open)).toEqual({
                invoiceId: 2,
                confidence: 'reference',
                overpays: false,
            });
        });

        /**
         * SmartBill off — stage today: no fiscal number, and the invoice email asks the family to write
         * the platform's own ("la detaliile plății scrie factura nr. 28"). A line that does as it was
         * told is as sure as one quoting a fiscal number; it used to fall back to name and sum.
         */
        it("matches by the platform's reference as the email printed it, whoever paid", () => {
            const open = [
                invoice({ invoiceId: 28, reference: platform(28) }),
                invoice({ invoiceId: 29, reference: platform(29), family: { parentId: 11, lastName: 'Ionescu' } }),
            ];

            expect(suggestMatch({ amount: 350, description: `plata ${platform(29)!.text} octombrie`, counterparty: 'BUNICA MARIA' }, open)).toEqual({
                invoiceId: 29,
                confidence: 'reference',
                overpays: false,
            });
        });

        it("knows the platform's reference however the family typed it", () => {
            const open = [invoice({ invoiceId: 28, reference: platform(28) })];

            for (const typed of ['Factura nr.28', 'factura nr 028', 'c/v FACTURA NR. 28.', 'factura nr: 28 octombrie']) {
                expect(suggestMatch({ amount: 350, description: typed, counterparty: null }, open)).toMatchObject({ invoiceId: 28, confidence: 'reference' });
            }
        });

        // "nr. 28" alone is a flat, a contract, an order: the words the email printed are the reference.
        it('does not take a bare number, or a different shape, for the platform reference', () => {
            const open = [invoice({ invoiceId: 28, reference: platform(28) })];

            for (const typed of ['plata 28', 'nr. 28', 'factura 28', 'apartament nr 28', 'factura nr. 280', 'factura nr. 128']) {
                expect(suggestMatch({ amount: 350, description: typed, counterparty: null }, open)).toBeNull();
            }
        });

        // Live, before SmartBill's number: nobody was told "factura nr. 28", and another family's
        // fiscal ITB 0028 is what a line writing that most likely means.
        it('does not match an invoice that has no reference yet', () => {
            const open = [invoice({ invoiceId: 28, reference: null })];

            expect(suggestMatch({ amount: 350, description: 'factura nr. 28', counterparty: null }, open)).toBeNull();
        });

        /**
         * Review of 27 September 2026: October issued before `live` stays open as invoice 28, while
         * November's is SmartBill's ITB 0028 for another family. "Factura nr. 0028" — the series
         * left out — was matched as sure to the platform's 28, and one press recorded Popescu's
         * money on Ionescu's invoice.
         */
        it('leaves the platform number to a person while an open fiscal invoice has the same number', () => {
            const open = [
                invoice({ invoiceId: 28, reference: platform(28), family: { parentId: 11, lastName: 'Ionescu' } }),
                invoice({ invoiceId: 90, reference: fiscal('0028') }),
            ];

            for (const typed of ['Factura nr. 0028', 'factura nr. 28 ITB']) {
                expect(suggestMatch({ amount: 350, description: typed, counterparty: null }, open)).toBeNull();
            }
            // Without the lookalike, the platform reference is sure again.
            expect(suggestMatch({ amount: 350, description: 'factura nr. 28', counterparty: null }, [open[0]])).toMatchObject({
                invoiceId: 28,
                confidence: 'reference',
            });
        });

        it('says when a referenced line pays more than is left', () => {
            expect(suggestMatch({ amount: 700, description: 'ITB 41', counterparty: null }, [invoice()])).toMatchObject({ overpays: true });
        });

        // One transfer for two months: a person splits it.
        it('leaves a line naming two invoices to a person', () => {
            const open = [invoice(), invoice({ invoiceId: 2, reference: fiscal('0042') })];
            expect(suggestMatch({ amount: 700, description: 'ITB 41 si ITB 42', counterparty: null }, open)).toBeNull();
        });

        it('matches by the family name and the exact sum left when there is no reference', () => {
            expect(suggestMatch({ amount: 350, description: 'plata cursuri', counterparty: 'POPESCU ANA' }, [invoice()])).toEqual({
                invoiceId: 1,
                confidence: 'name',
                overpays: false,
            });
        });

        it('does not guess by name when the sum fits nothing', () => {
            expect(suggestMatch({ amount: 300, description: 'plata cursuri', counterparty: 'POPESCU ANA' }, [invoice()])).toBeNull();
        });

        it('needs the first name when two families share the last one', () => {
            const open = [invoice(), invoice({ invoiceId: 2, family: { parentId: 11, firstName: 'Mihai', lastName: 'Popescu' } })];

            expect(suggestMatch({ amount: 350, description: '', counterparty: 'POPESCU' }, open)).toBeNull();
            expect(suggestMatch({ amount: 350, description: '', counterparty: 'POPESCU MIHAI' }, open)).toMatchObject({ invoiceId: 2, confidence: 'name' });
        });

        it('reads names without diacritics as the bank writes them', () => {
            const open = [invoice({ family: { firstName: 'Ștefan', lastName: 'Țăranu' } })];
            expect(suggestMatch({ amount: 350, description: '', counterparty: 'TARANU STEFAN' }, open)).toMatchObject({ confidence: 'name' });
        });
    });
    describe('withRunningRemainder', () => {
        const open = [invoice({ invoiceId: 41, outstanding: 350 })];
        const sure = (overpays = false): MatchSuggestion => ({ invoiceId: 41, confidence: 'reference', overpays });

        it('lets the first of two lines citing one invoice through, and leaves the second to a person', () => {
            const lines = [
                { id: 2, bookedOn: '2026-11-05', amount: 350 },
                { id: 1, bookedOn: '2026-11-03', amount: 350 },
            ];
            const judged = withRunningRemainder(
                lines,
                new Map([
                    [1, sure()],
                    [2, sure()],
                ]),
                open,
            );

            expect(judged.get(1)?.overpays).toBe(false);
            expect(judged.get(2)?.overpays).toBe(true);
        });

        it('lets two partial payments through while together they fit, and stops the one that does not', () => {
            const lines = [
                { id: 1, bookedOn: '2026-11-03', amount: 200 },
                { id: 2, bookedOn: '2026-11-04', amount: 150 },
                { id: 3, bookedOn: '2026-11-05', amount: 0.01 },
            ];
            const judged = withRunningRemainder(
                lines,
                new Map([
                    [1, sure()],
                    [2, sure()],
                    [3, sure()],
                ]),
                open,
            );

            expect([1, 2, 3].map((id) => judged.get(id)?.overpays)).toEqual([false, false, true]);
        });

        it('orders by the day the money arrived, then by line, whatever order the page shows', () => {
            const lines = [
                { id: 9, bookedOn: '2026-11-03', amount: 350 },
                { id: 4, bookedOn: '2026-11-03', amount: 350 },
            ];
            const judged = withRunningRemainder(
                lines,
                new Map([
                    [9, sure()],
                    [4, sure()],
                ]),
                open,
            );

            expect(judged.get(4)?.overpays).toBe(false);
            expect(judged.get(9)?.overpays).toBe(true);
        });

        it('leaves name suggestions, lines without one, and a line that already overpays as they were', () => {
            const byName: MatchSuggestion = { invoiceId: 41, confidence: 'name', overpays: false };
            const lines = [
                { id: 1, bookedOn: '2026-11-03', amount: 500 },
                { id: 2, bookedOn: '2026-11-04', amount: 350 },
                { id: 3, bookedOn: '2026-11-05', amount: 350 },
            ];
            const judged = withRunningRemainder(
                lines,
                new Map([
                    [1, sure(true)],
                    [2, byName],
                    [3, null],
                ]),
                open,
            );

            expect(judged.get(1)).toEqual(sure(true));
            expect(judged.get(2)).toEqual(byName);
            expect(judged.get(3)).toBeNull();
        });
    });
});
