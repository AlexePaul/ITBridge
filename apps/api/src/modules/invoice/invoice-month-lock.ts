import { EntityManager } from 'typeorm';

/**
 * Puts everything that decides what a month's invoices are made of in one line with issuing that
 * month — the review of 25 September 2026.
 *
 * Issuing reads the month (registers, the vacation ticks, the per-child corrections, the
 * discounts) and writes one invoice per family; each of those writers is refused once the month it
 * would change is invoiced. Checked on their own snapshots, a correction saved in the same second
 * as "emite" could land after the issue had read the month and before its invoice existed: the
 * invoice ignored it, and the row then sat frozen on a month it never reached — the screen showing
 * one number and the invoice carrying another, which is the one thing the freeze exists to
 * prevent. So the issue takes this lock before it reads the month, and each writer takes it before
 * it checks that the month is still open, in the transaction that writes.
 *
 * Keyed on the month alone, not the family: an issue covers every family at once. Transaction
 * scoped, so it goes with the commit and there is nothing to release. Two months are always taken
 * in order (`lockInvoiceMonths`), or two edits moving discounts in opposite directions would each
 * hold one and wait on the other.
 */
export async function lockInvoiceMonth(manager: EntityManager, monthIssued: string): Promise<void> {
    await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`invoice-month:${monthIssued}`]);
}

/** Several months, each once, oldest first — the one order every caller takes them in. */
export async function lockInvoiceMonths(manager: EntityManager, months: string[]): Promise<void> {
    for (const month of [...new Set(months)].sort()) {
        await lockInvoiceMonth(manager, month);
    }
}
