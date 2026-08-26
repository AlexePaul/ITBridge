import type { BillingMonth, ISODate } from './common';
import type { ProfileSummary } from './profile';

/** Mirrors `InvoiceStatus` in `apps/api/src/entities/invoice.entity.ts`. */
export type InvoiceStatus = 'pending' | 'paid' | 'overdue';

export interface Invoice {
    id: number;
    /** `decimal` in Postgres, exposed as a `number` through a transformer on the column. */
    amount: number;
    dateIssued: ISODate;
    monthIssued: BillingMonth;
    status: InvoiceStatus;
    /** Present only when the query joins the parent. */
    parent?: ProfileSummary;
}
