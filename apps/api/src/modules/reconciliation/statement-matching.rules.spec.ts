import { namesInvoice, normalizeText, suggestMatch, type OpenInvoice } from './statement-matching.rules';

/** Which invoice a statement line pays — E16/S8. A proposal, never a decision. */
describe('statement matching', () => {
    const invoice = (overrides: Omit<Partial<OpenInvoice>, 'family'> & { family?: Partial<OpenInvoice['family']> } = {}): OpenInvoice => {
        const { family, ...rest } = overrides;
        return {
            invoiceId: 1,
            monthIssued: '2026-10',
            outstanding: 350,
            fiscalSeries: 'ITB',
            fiscalNumber: '0041',
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
            const open = [invoice(), invoice({ invoiceId: 2, fiscalNumber: '0042', family: { parentId: 11, lastName: 'Ionescu' } })];

            expect(suggestMatch({ amount: 350, description: 'plata ITB 0042', counterparty: 'BUNICA MARIA' }, open)).toEqual({
                invoiceId: 2,
                confidence: 'reference',
                overpays: false,
            });
        });

        it('says when a referenced line pays more than is left', () => {
            expect(suggestMatch({ amount: 700, description: 'ITB 41', counterparty: null }, [invoice()])).toMatchObject({ overpays: true });
        });

        // One transfer for two months: a person splits it.
        it('leaves a line naming two invoices to a person', () => {
            const open = [invoice(), invoice({ invoiceId: 2, fiscalNumber: '0042' })];
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
});
