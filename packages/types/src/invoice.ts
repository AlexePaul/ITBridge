import type { BillingMonth, ISODate } from './common';
import type { ProfileSummary } from './profile';

/** Oglindește `InvoiceStatus` din `apps/api/src/entities/invoice.entity.ts`. */
export type InvoiceStatus = 'pending' | 'paid' | 'overdue';

export interface Invoice {
    id: number;
    /** `decimal` în Postgres, expus ca `number` printr-un transformer pe coloană. */
    amount: number;
    dateIssued: ISODate;
    monthIssued: BillingMonth;
    status: InvoiceStatus;
    /** Prezent doar când interogarea face join pe părinte. */
    parent?: ProfileSummary;
}
