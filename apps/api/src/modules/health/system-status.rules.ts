import type { SmartBillMode } from 'src/modules/smartbill/smartbill.config';

/**
 * What the backend should say about its own configuration — the notes on `/admin/sistem`.
 *
 * Pure, so every combination has a test: the facts come in, the codes go out. The sentences are the
 * screen's (`apps/web/app/pages/admin/sistem.vue`); the API names the case, as it does for a 409.
 */

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

export type SystemNoteLevel = 'problem' | 'notice';

export interface SystemNote {
    level: SystemNoteLevel;
    code: SystemNoteCode;
}

/** Everything the notes are decided from, read once by the service. */
export interface ConfigurationFacts {
    environment: string;
    siteUrlConfigured: boolean;
    siteUrl: string;
    mailSending: boolean;
    mailProviderConfigured: boolean;
    transferDetails: boolean;
    storageReachable: boolean;
    pendingMigrations: number;
    smartBillMode: SmartBillMode;
}

/** A laptop, where nothing is sent to a family and a missing key is the normal state. */
const isLocal = (environment: string) => environment === 'development' || environment === 'test';

const LOCAL_HOST = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i;

/**
 * The notes, problems first. A problem is something a family or the office will run into; a notice
 * is a fact worth having in front of you while testing, such as "SmartBill is off".
 */
export function configurationNotes(facts: ConfigurationFacts): SystemNote[] {
    const notes: SystemNote[] = [];
    const problem = (code: SystemNoteCode) => notes.push({ level: 'problem', code });
    const notice = (code: SystemNoteCode) => notes.push({ level: 'notice', code });
    const local = isLocal(facts.environment);

    // The links in every email. Unset, they fall back to the public domain, which is right in
    // production and wrong everywhere else: until the launch the public site has no portal pages, so
    // stage's confirmation links led nowhere. On a laptop the fallback is just as wrong, but nobody
    // there follows a link from an inbox.
    if (!facts.siteUrlConfigured && facts.environment !== 'production') {
        if (local) notice('SITE_URL_MISSING');
        else problem('SITE_URL_MISSING');
    }
    if (facts.siteUrlConfigured && !local && LOCAL_HOST.test(facts.siteUrl)) problem('SITE_URL_LOCAL');

    // Production that sends nothing is either stage wearing the wrong label (27 September 2026) or
    // production failing every family: both are for a person to settle today.
    if (facts.environment === 'production' && !facts.mailSending) problem('PRODUCTION_WITHOUT_MAIL');
    if (facts.mailSending && !facts.mailProviderConfigured) {
        if (local) notice('MAIL_KEY_MISSING');
        else problem('MAIL_KEY_MISSING');
    }
    if (!facts.mailSending && facts.environment !== 'production') notice('MAIL_OFF');

    if (!facts.storageReachable) problem('STORAGE_UNREACHABLE');
    if (facts.pendingMigrations > 0) problem('MIGRATIONS_PENDING');

    // Not a fault anywhere: the portal and the invoice email send the family to the office instead
    // of printing an account. In production it is the missing half of every transfer.
    if (!facts.transferDetails) {
        if (facts.environment === 'production') problem('TRANSFER_DETAILS_MISSING');
        else notice('TRANSFER_DETAILS_MISSING');
    }

    notice(facts.smartBillMode === 'live' ? 'SMARTBILL_LIVE' : facts.smartBillMode === 'draft' ? 'SMARTBILL_DRAFT' : 'SMARTBILL_OFF');

    return [...notes.filter((note) => note.level === 'problem'), ...notes.filter((note) => note.level === 'notice')];
}
