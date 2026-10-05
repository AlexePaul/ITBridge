import type { Invoice } from 'src/entities/invoice.entity';

/**
 * Where an invoice's PDF lives in the bucket — whoever made it.
 *
 * On its own so the fiscal queue can use it without importing `InvoiceService`, which imports the
 * queue. Since E16/S2 the object at this key is the platform's own PDF in `off` and `draft`, and
 * SmartBill's fiscal one in `live`: everything that reads "the invoice's PDF" — the download, the
 * privacy export, the erasure — keeps reading it here without having to know which.
 *
 * **The key names the row, not the id** (QA of 27 September 2026). An id comes back: `pnpm seed`
 * empties the tables and not the bucket, a restore from backup rewinds the sequence, and the next
 * invoice issued with that id found the drawing of the one before it — Horia Barbu downloaded his
 * August invoice and read Florin Marin's name, address and amount. The row's `createdAt` goes in
 * the key, so a recycled id is a key nothing has written yet, and the document is drawn from the
 * row it belongs to. An edit keeps `createdAt`, so the key a drawing was kept under is still the one
 * the edit drops.
 */
export function invoicePdfKey(invoice: Pick<Invoice, 'id' | 'monthIssued' | 'createdAt'>): string {
    const born = new Date(invoice.createdAt).getTime();
    // A row read without its `createdAt` would name `…-NaN.pdf`, the one key every such row shares:
    // exactly the collision this key exists to prevent. Refused, so it fails where it is written.
    if (!Number.isFinite(born)) throw new Error(`Invoice ${invoice.id} was read without createdAt; its PDF has no key.`);
    return `invoices/${invoice.monthIssued}/${invoice.id}-${born}.pdf`;
}
