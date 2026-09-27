/**
 * The error record on the wire — E06 S1.
 *
 * What broke, where and how often, one entry per fault, for `/admin/erori`. A literal union rather
 * than an enum, like every other value this package names: a value exported from here has reached
 * the browser as `undefined` twice (CLAUDE.md).
 */

/** A request answered 5xx; the server logged an error; a screen broke in a browser. */
export type ErrorSource = 'request' | 'logged' | 'browser';

/** Which reports a list shows. `ref` overrides it: a code read out from a screen is searched everywhere. */
export type ErrorReportState = 'open' | 'resolved' | 'all';

/** One time it happened, with the account behind it looked up when the list is read. */
export interface ErrorOccurrence {
    at: string;
    /** The code the screen showed: a request id, or the browser's own reference. */
    ref: string | null;
    userId: number | null;
    /** The address, redacted like a log line. */
    path: string | null;
    username: string | null;
    profileId: number | null;
    familyName: string | null;
}

export interface ErrorReport {
    id: number;
    source: ErrorSource;
    /** `GET /invoices/:id`, a job's name, or a page and its component. */
    origin: string;
    errorName: string;
    message: string;
    stack: string | null;
    statusCode: number | null;
    code: string | null;
    occurrences: number;
    firstSeenAt: string;
    lastSeenAt: string;
    resolvedAt: string | null;
    /** The last twenty, newest first. */
    recent: ErrorOccurrence[];
}

export interface ErrorReportSummary {
    open: number;
}

/** How the browser caught it. */
export type ClientErrorKind = 'vue' | 'unhandledrejection' | 'window';

/** `POST /errors/client` — a screen that broke, from the browser it broke in. */
export interface ClientErrorReport {
    name: string;
    message: string;
    stack?: string;
    /** The route pattern, `/admin/profiles/:id`. */
    route: string;
    path?: string;
    /** Innermost first: `InvoiceTable < AdminPage`. */
    component?: string;
    kind: ClientErrorKind;
    /** The code the error page shows, made up in the browser. */
    reference?: string;
}
