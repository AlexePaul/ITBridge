import type { BillingMonth, ISODate, ISODateTime, TimeOfDay } from './common';
import type { ProfileSummary } from './profile';

/**
 * Mirrors `InvoiceStatus` in `apps/api/src/entities/invoice.entity.ts`.
 *
 * `'waived'` is a month handled with nothing to pay — a child who could not come at all, or one the
 * school chose not to charge. It exists so that "no invoice" and "an invoice for nothing" are two
 * different things on screen; the second is settled, the first is forgotten.
 */
export type InvoiceStatus = 'pending' | 'paid' | 'overdue' | 'waived';

/**
 * Where an invoice stands with SmartBill, the school's fiscal system — E16/S2. Mirrors
 * `InvoiceFiscalStatus` in `apps/api/src/entities/invoice.entity.ts`; `null` on the invoice means it
 * was never meant for SmartBill (issued in mode `off`, before the integration, or a waived month).
 *
 * `uncertain` is a request in the air or one whose answer was lost; `review` is one a person has to
 * settle, because SmartBill's series moved while the answer was missing.
 */
export type InvoiceFiscalStatus = 'pending' | 'uncertain' | 'review' | 'draft' | 'issued' | 'failed';

/** What `SMARTBILL_MODE` is set to. `off` sends nothing; `draft` sends drafts only; `live` issues. */
export type SmartBillMode = 'off' | 'draft' | 'live';

export interface Invoice {
    id: number;
    /** `decimal` in Postgres, exposed as a `number` through a transformer on the column. */
    amount: number;
    dateIssued: ISODate;
    monthIssued: BillingMonth;
    status: InvoiceStatus;
    /** Present only when the query joins the parent. */
    parent?: ProfileSummary;
    fiscalStatus: InvoiceFiscalStatus | null;
    /** Set once SmartBill issued it: the series and number the family and the accountant read. */
    fiscalSeries: string | null;
    fiscalNumber: string | null;
    /** The document in SmartBill Cloud — opens only with a SmartBill login, so it is for the office. */
    fiscalDocumentUrl: string | null;
    /** SmartBill's public link to the fiscal PDF, meant for the family. */
    fiscalViewUrl: string | null;
    fiscalIssuedAt: ISODateTime | null;
    /** SmartBill's own words when it refused, or why the queue is waiting. */
    fiscalLastError: string | null;
    /** The series' next number when a lost answer was sent — the likely number of an invoice under review. */
    fiscalExpectedNumber: number | null;
    /**
     * SmartBill's side as last read — E16/S8: what it counts as collected, its total, and when.
     * Checked with both figures empty means SmartBill no longer knows the number.
     */
    fiscalPaidAmount: number | null;
    fiscalTotalAmount: number | null;
    fiscalCheckedAt: ISODateTime | null;
}

/**
 * `GET /invoices/fiscal-queue` — E16/S3's progress, with the mode beside it: "în coadă" means one
 * thing when the timer is sending and another when nothing is.
 */
export interface FiscalQueueStatus {
    mode: SmartBillMode;
    /** Settings the mode cannot work without — `NODE_ENV=production` among them for `live` outside production; empty when complete. */
    missing: string[];
    series: string | null;
    lockedUntil: ISODateTime | null;
    counts: Record<InvoiceFiscalStatus, number>;
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

/**
 * Why the platform and SmartBill disagree about an invoice — E16/S8. Mirrors `DivergenceReason` in
 * `apps/api/src/modules/invoice/fiscal-divergence.rules.ts`.
 */
export type DivergenceReason =
    'missing_in_smartbill' | 'total_differs' | 'changed_in_smartbill' | 'reversed_still_recorded' | 'not_recorded';

export interface FiscalDivergenceRow {
    invoiceId: number;
    monthIssued: string;
    familyName: string;
    fiscalSeries: string | null;
    fiscalNumber: string | null;
    amount: number;
    smartbillTotal: number | null;
    /** Money the platform counts as received. */
    platformPaid: number;
    /** What the platform recorded in SmartBill. */
    recordedPaid: number;
    smartbillPaid: number | null;
    checkedAt: ISODateTime;
    reasons: DivergenceReason[];
}

/** `GET /invoices/fiscal-divergences`. */
export interface FiscalDivergenceReport {
    mode: SmartBillMode;
    missing: string[];
    lockedUntil: ISODateTime | null;
    issued: number;
    unchecked: number;
    oldestCheckAt: ISODateTime | null;
    rows: FiscalDivergenceRow[];
}
