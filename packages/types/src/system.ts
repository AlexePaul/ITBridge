/**
 * The backend's configuration as the office can read it — `GET /system/status`, `/admin/sistem`.
 *
 * Stage ran for a day labelled `production` and without `SITE_URL`, and nothing on a screen said so:
 * the first sign would have been a confirmation link pointing at the public site. This is the page
 * that says it, read on the server, after every change in Parameter Store. It carries whether a key
 * is set, never the key.
 *
 * `notes` are codes, not sentences: the API speaks English and the screen Romanian, as everywhere
 * else in the platform. The screen fills a sentence from the facts beside it — the address, the
 * pending migrations' names.
 */

/** What the backend noticed about itself. The screen has one sentence per code. */
export type SystemNoteCode =
    | 'SITE_URL_MISSING'
    | 'SITE_URL_LOCAL'
    | 'PRODUCTION_WITHOUT_MAIL'
    | 'MAIL_KEY_MISSING'
    | 'MAIL_OFF'
    | 'TRANSFER_DETAILS_MISSING'
    | 'STORAGE_UNREACHABLE'
    | 'MIGRATIONS_PENDING'
    | 'SMARTBILL_OFF'
    | 'SMARTBILL_DRAFT'
    | 'SMARTBILL_LIVE';

/** `problem`: a family or the office will run into it. `notice`: a fact worth knowing while testing. */
export type SystemNoteLevel = 'problem' | 'notice';

export interface SystemNote {
    level: SystemNoteLevel;
    code: SystemNoteCode;
}

export interface SystemStatus {
    /** When the server answered, as an instant. */
    checkedAt: string;
    /** The school's clock, `YYYY-MM-DDTHH:mm` on Europe/Bucharest — the one every "today" is read on. */
    schoolTime: string;
    /** `NODE_ENV`, or `development` when it is not set. */
    environment: string;
    nodeVersion: string;
    uptimeSeconds: number;
    /**
     * The commit the API process runs, asked of git when it started — `null` where git could not
     * answer — and when it started. After a push, this is where "has it reached stage?" is answered.
     */
    build: { commit: string | null; committedAt: string | null; startedAt: string };
    /** Where the links in emails point: `SITE_URL`, or the public domain it falls back to. */
    siteUrl: string;
    siteUrlConfigured: boolean;
    mail: {
        /** The dispatcher is on: `MAIL_OUTBOX_ENABLED` is not `false`. */
        sending: boolean;
        /** `MAIL_RESEND_API_KEY` and `MAIL_FROM` are both set. Their values never leave the server. */
        providerConfigured: boolean;
        from: string | null;
        officeAddress: string;
    };
    smartBillMode: 'off' | 'draft' | 'live';
    /** `SCHOOL_LEGAL_NAME` and `SCHOOL_IBAN` are both set, so the portal can say where a transfer goes. */
    transferDetails: boolean;
    storage: { bucket: string | null; reachable: boolean };
    swagger: boolean;
    migrations: {
        applied: number;
        /** The newest migration that ran — the schema's version, for a bug report. */
        last: string | null;
        /** Migrations in this build that have not run. Empty after every good deploy. */
        pending: string[];
    };
    notes: SystemNote[];
}
