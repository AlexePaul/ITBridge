import type { BillingMonth, ISODate } from './common';
import type { ProfileSummary } from './profile';

/**
 * Mirrors `InvoiceStatus` in `apps/api/src/entities/invoice.entity.ts`.
 *
 * `'waived'` is a month handled with nothing to pay — a child who could not come at all, or one the
 * school chose not to charge. It exists so that "no invoice" and "an invoice for nothing" are two
 * different things on screen; the second is settled, the first is forgotten.
 */
export type InvoiceStatus = 'pending' | 'paid' | 'overdue' | 'waived';

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

/**
 * One family's row on the monthly issuing screen — E15, the model in force.
 *
 * Carries no amount on purpose: the arithmetic happens on the screen as the admin types the session
 * counts, and a total arriving pre-computed would invite pressing the button without reading it.
 */
export interface InvoiceWorksheetRow {
    parentId: number;
    parentName: string;
    email: string | null;
    /** True when this family already has an invoice for the month. The screen skips them. */
    alreadyInvoiced: boolean;
    children: {
        childId: number;
        childName: string;
        groupId: number | null;
        groupName: string | null;
        /** ISO weekday of the group, so whoever counts knows which day to count. */
        weekday: number | null;
    }[];
}

/**
 * What `POST /invoices/issue` answers with.
 *
 * `waived` are the months recorded as owing nothing — they are rows in the database, not omissions,
 * and they carry no PDF. `skipped` is only ever families that already had an invoice for the month,
 * which is what makes the screen safe to run twice.
 */
export interface IssueInvoicesResult {
    issued: Invoice[];
    waived: Invoice[];
    skipped: { parentId: number; reason: 'ALREADY_INVOICED' }[];
}
