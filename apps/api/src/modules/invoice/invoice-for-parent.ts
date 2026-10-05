import type { Invoice } from 'src/entities/invoice.entity';

/**
 * What a family reads of its own invoice: the document SmartBill made — its series, its number and
 * the public link meant for the family —, never the queue that made it.
 *
 * Rows went out whole, so a parent's `GET /invoices` carried the fiscal pipeline's internals: the
 * last error SmartBill answered, the number the queue expected, the attempts and the next one, the
 * document's page in SmartBill Cloud (behind the school's login) and SmartBill's own figures from the
 * divergence check (security pass of 27 September 2026). Nothing in the portal reads them, and a
 * SmartBill error text is the school's business. A copy, never an edit in place: the row may be held
 * by something else, the way `child.parent` is (CLAUDE.md, „Se scoate copiind").
 */
export function invoiceForParent<T extends Invoice>(invoice: T): T {
    return {
        ...invoice,
        fiscalStatus: null,
        fiscalDocumentId: null,
        fiscalDocumentUrl: null,
        fiscalAttempts: 0,
        fiscalNextAttemptAt: null,
        fiscalExpectedNumber: null,
        fiscalLastError: null,
        fiscalPaidAmount: null,
        fiscalTotalAmount: null,
        fiscalCheckedAt: null,
    };
}
