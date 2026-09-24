/**
 * Where an invoice's PDF lives in the bucket — whoever made it.
 *
 * On its own so the fiscal queue can use it without importing `InvoiceService`, which imports the
 * queue. Since E16/S2 the object at this key is the platform's own PDF in `off` and `draft`, and
 * SmartBill's fiscal one in `live`: everything that reads "the invoice's PDF" — the download, the
 * privacy export, the erasure — keeps reading it here without having to know which.
 */
export function invoicePdfKey(monthIssued: string, invoiceId: number): string {
    return `invoices/${monthIssued}/${invoiceId}.pdf`;
}
