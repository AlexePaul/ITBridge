import { invoicePdfKey } from './invoice-pdf-key';

describe('invoicePdfKey', () => {
    const row = { id: 17, monthIssued: '2026-08', createdAt: new Date('2026-09-27T18:00:00Z') };

    it('names the row, not only its id', () => {
        expect(invoicePdfKey(row)).toBe(`invoices/2026-08/17-${row.createdAt.getTime()}.pdf`);
    });

    // QA of 27 September 2026: a reseed emptied the tables and not the bucket, and the next invoice
    // issued with id 17 was served the drawing of the invoice that had id 17 before it.
    it('gives a recycled id a key nothing has written yet', () => {
        const before = { ...row, createdAt: new Date('2026-08-23T09:00:00Z') };
        expect(invoicePdfKey(row)).not.toBe(invoicePdfKey(before));
    });

    it('reads the same key from the column as the driver hands it back', () => {
        expect(invoicePdfKey({ ...row, createdAt: '2026-09-27T18:00:00.000Z' as unknown as Date })).toBe(invoicePdfKey(row));
    });

    it('refuses a row read without its creation time, rather than sharing one key among all of them', () => {
        expect(() => invoicePdfKey({ ...row, createdAt: undefined as unknown as Date })).toThrow(/without createdAt/);
    });
});
