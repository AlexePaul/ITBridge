import type { BillingMonth, ISODate, TimeOfDay } from './common';
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
    /** What the family will be billed, after this month's discounts — the same number the server writes. */
    amount: number;
    children: {
        childId: number;
        childName: string;
        groupId: number | null;
        groupName: string | null;
        /** ISO weekday of the group. */
        weekday: number | null;
        /** What reaches the price: the count from the registers, or the override's number when one is on file. */
        sessions: number;
        /** What the registers say, always — E15/S9. Differs from `sessions` only under an override. */
        counted: number;
        /** The decision on file for this child and month, if any. */
        override: { sessions: number; reason: string | null } | null;
        /** Every held session of the child's group in the month, and whether it counted for them. */
        lines: InvoiceWorksheetLine[];
    }[];
}

/**
 * "Bill this many instead" — `PUT /invoices/overrides`, E15/S9.
 *
 * The one number that still enters by hand, and it is a recorded decision rather than a field on
 * the issuing call. One per child and month; a second one replaces the first; zero means "not this
 * month". Refused once the family's month is issued.
 */
export interface SessionCountOverrideDto {
    monthIssued: BillingMonth;
    childId: number;
    sessions: number;
    reason?: string;
}

/** One held session, as the issuing screen unfolds it under a child. */
export interface InvoiceWorksheetLine {
    sessionId: number;
    date: ISODate;
    isVacation: boolean;
    /** The child's own mark; `null` when the register has no row for them. */
    present: boolean | null;
    /** False only for a vacation session the child was not marked present at. */
    counted: boolean;
}

/** A session of the month with no register — the money not being asked for. */
export interface InvoiceWorksheetUnmarked {
    sessionId: number;
    groupId: number;
    groupName: string;
    date: ISODate;
    startTime: TimeOfDay;
}

/**
 * The whole issuing screen in one payload — E15/S9.
 *
 * The month is the *teaching* month: the weeks whose Monday falls in it, so `from` may be in the
 * previous calendar month and `to` in the next. `unmarked` comes first on the screen because it is
 * the one thing the person about to press the button must see.
 */
export interface InvoiceWorksheet {
    month: string;
    from: ISODate;
    to: ISODate;
    unmarked: InvoiceWorksheetUnmarked[];
    families: InvoiceWorksheetRow[];
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

/**
 * How old a debt is, in the words an admin would use — E16/S7.
 *
 * Buckets rather than a raw number of days, because the action differs by band and a list of days
 * does not say which: a week late is a reminder, two months late is a conversation.
 */
export type ArrearsBucket = 'due_soon' | 'overdue' | 'over_30' | 'over_60';

/**
 * One unpaid invoice, as the arrears screen reads it.
 *
 * Derived from succeeded payments rather than read off `Invoice.status`: the status column is a
 * cache a daily job refreshes, and a screen about money must not be wrong for a day because a job
 * did not run.
 */
export interface ArrearsRow {
    invoiceId: number;
    parentId: number;
    parentName: string;
    email: string | null;
    /** Carried because chasing a payment is a phone call, not a second screen. */
    phone: string | null;
    monthIssued: BillingMonth;
    dateIssued: ISODate;
    /** The last day the family could pay without being late. */
    dueOn: ISODate;
    amount: number;
    /** What has been received. A partial payment is the interesting middle case. */
    paid: number;
    outstanding: number;
    daysOverdue: number;
    bucket: ArrearsBucket;
}
