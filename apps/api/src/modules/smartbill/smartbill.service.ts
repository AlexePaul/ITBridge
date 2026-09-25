import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { mayIssueFiscalDocuments, missingSmartBillSettings, SMARTBILL_DEFAULT_BASE_URL, smartBillConfig, type SmartBillConfig } from './smartbill.config';
import {
    classifyFailure,
    describeFailure,
    isSuccess,
    readIssuedDocument,
    SmartBillError,
    type IssuedDocument,
    type SeriesEntry,
    type SmartBillInvoiceRequest,
    type TaxEntry,
} from './smartbill.rules';
import {
    readPaymentStatus,
    readRecordedPayment,
    type InvoicePaymentStatus,
    type RecordedPayment,
    type SmartBillPaymentRequest,
} from './smartbill-payment.rules';

/**
 * The only place `apps/api` talks to SmartBill — E16/S0 and S2.
 *
 * **Nothing calls `issueInvoice` from a request handler.** Issuing goes through
 * `FiscalIssuingService`, which writes the intent down first and lets a timer do the sending, for
 * the reason the outbox exists: an admin pressing "emite" must not wait on SmartBill, and SmartBill
 * being down must not undo the month.
 *
 * Plain `fetch`, like `MailService` and Resend: V1 is one Basic-authenticated JSON call per verb,
 * and the error handling is the part that needs to be ours anyway.
 */

/**
 * Past this, the request is treated as unanswered. Generous on purpose: an answer that arrives
 * after the timeout is the one outcome that costs a person a look (`reconcile`), so the timeout
 * should only ever fire on a request that was really lost.
 */
const ISSUE_TIMEOUT_MS = 30_000;
const READ_TIMEOUT_MS = 15_000;

/**
 * At least this long between two calls from this process: at most twenty-five in any ten seconds,
 * against a limit of thirty. The margin is the point — the lock-out lasts ten minutes, and the
 * office may be using the same token from the check script while the timer runs.
 */
export const MIN_CALL_GAP_MS = 400;

/** "In caz de abatere, accesul este blocat timp de 10 minute." Plus a little, so we do not arrive early. */
export const LOCKOUT_MS = 10 * 60 * 1000 + 15_000;

@Injectable()
export class SmartBillService implements OnModuleInit {
    private readonly logger = new Logger('SmartBill');

    private lastCallAt = 0;

    /**
     * Calls start one after another, `MIN_CALL_GAP_MS` apart, whoever makes them: the timer and an
     * admin opening a PDF share one token and one limit. Only the start is serialised, not the whole
     * request, so a slow answer does not hold up the next read.
     */
    private slot: Promise<void> = Promise.resolve();

    /**
     * Until when this process will not call SmartBill at all, after a lock-out answer. Every call in
     * those ten minutes would be refused, and on V3 the penalty grows with each one — so they are
     * refused here instead, without leaving the building.
     */
    private lockedUntil = 0;

    /** Says once, at boot, what this backend will do — the first sign of a wrong mode must not be an invoice. */
    onModuleInit(): void {
        const config = smartBillConfig();
        if (config.mode === 'off') {
            this.logger.log('Mode off: invoices are issued locally and nothing is sent to SmartBill.');
            return;
        }
        const missing = missingSmartBillSettings(config);
        if (missing.length > 0) {
            this.logger.warn(`Mode ${config.mode}, but ${missing.join(', ')} not set: invoices will wait in the fiscal queue.`);
            return;
        }
        const what = config.mode === 'live' ? 'REAL fiscal invoices' : 'drafts only, no fiscal documents';
        this.logger.log(`Mode ${config.mode} under NODE_ENV=${process.env.NODE_ENV ?? '(unset)'}: ${what}, series ${config.invoiceSeries}, CIF ${config.cif}.`);
    }

    /** When the lock-out ends, or `null` when there is none. */
    lockedOutUntil(now: Date = new Date()): Date | null {
        return this.lockedUntil > now.getTime() ? new Date(this.lockedUntil) : null;
    }

    /** VAT rates configured in the account. Read-only: the check script's first question. */
    async taxes(): Promise<TaxEntry[]> {
        const config = this.readyConfig();
        const body = await this.call(config, 'GET', `/tax?cif=${encodeURIComponent(config.cif)}`, undefined, READ_TIMEOUT_MS);
        return entriesOf(body, 'taxes').flatMap((entry) =>
            typeof entry.name === 'string' && typeof entry.percentage === 'number' ? [{ name: entry.name, percentage: entry.percentage }] : [],
        );
    }

    /** Document series with their next number. Read-only, and what `reconcile` is decided from. */
    async series(type: SeriesEntry['type']): Promise<SeriesEntry[]> {
        const config = this.readyConfig();
        const body = await this.call(config, 'GET', `/series?cif=${encodeURIComponent(config.cif)}&type=${type}`, undefined, READ_TIMEOUT_MS);
        return entriesOf(body, 'list').flatMap((entry) =>
            typeof entry.name === 'string' && typeof entry.nextNumber === 'number' && (entry.type === 'f' || entry.type === 'p' || entry.type === 'c')
                ? [{ name: entry.name, nextNumber: entry.nextNumber, type: entry.type }]
                : [],
        );
    }

    /**
     * The next number of the platform's invoice series.
     *
     * Throws `configuration` when the series is not in the account at all — the spec's "Seria nu a
     * fost gasita!", found before any invoice is sent rather than on the first one.
     */
    async nextInvoiceNumber(): Promise<number> {
        const config = this.readyConfig();
        const entry = (await this.series('f')).find((series) => series.name === config.invoiceSeries);
        if (!entry) {
            throw new SmartBillError('configuration', `Seria de facturi „${config.invoiceSeries}” nu există în contul SmartBill.`);
        }
        return entry.nextNumber;
    }

    /**
     * `POST /invoice/v2`. Returns the document, or throws `SmartBillError` whose `kind` says what may
     * be done next — see `SmartBillFailureKind`. Never retries by itself: that is the queue's call,
     * and for an invoice it is a decision with a fiscal consequence.
     *
     * **Anything but a draft is refused outside production**, whatever `SMARTBILL_MODE` says. Boot
     * already refuses `live` there; this is the door every request passes, so a stage backend
     * cannot issue a fiscal document by any road — the queue, the check script, or one not written
     * yet. `configuration`, because nothing was sent and a setting is what would change the answer.
     */
    async issueInvoice(payload: SmartBillInvoiceRequest): Promise<IssuedDocument> {
        const config = this.readyConfig();
        if (payload.isDraft !== true && !mayIssueFiscalDocuments()) {
            throw new SmartBillError(
                'configuration',
                `Only a production backend issues fiscal invoices; NODE_ENV=${process.env.NODE_ENV ?? '(unset)'} sends drafts. Nothing was sent.`,
            );
        }
        const body = await this.call(config, 'POST', '/invoice/v2', payload, ISSUE_TIMEOUT_MS);
        const document = readIssuedDocument(body);
        // A fiscal invoice is its number. An answer that says "done" without one is an invoice that
        // may exist under a number nobody saw — the series decides, as for a lost answer. Taken as a
        // success, it became an `issued` row with no number, which nothing could retry, confirm,
        // edit or delete, and whose PDF was a 404 for good.
        if (payload.isDraft !== true && (!document.series || !document.number)) {
            throw new SmartBillError('ambiguous', 'SmartBill confirmed the invoice without its series and number; the series decides whether it exists.');
        }
        return document;
    }

    /**
     * The next number of the platform's receipt series — E16/S5. The same question as
     * `nextInvoiceNumber`, for the other numbered document the platform asks SmartBill for.
     */
    async nextReceiptNumber(): Promise<number> {
        const config = this.readyConfig();
        if (!config.receiptSeries) {
            throw new SmartBillError('configuration', 'SMARTBILL_RECEIPT_SERIES is not set; a cash payment has no series to be numbered on. Nothing was sent.');
        }
        const entry = (await this.series('c')).find((series) => series.name === config.receiptSeries);
        if (!entry) {
            throw new SmartBillError('configuration', `Seria de chitanțe „${config.receiptSeries}” nu există în contul SmartBill.`);
        }
        return entry.nextNumber;
    }

    /**
     * `GET /invoice/paymentstatus`: how much of a numbered invoice SmartBill counts as collected.
     * Read-only — and the proof a lost payment request is settled by, since the answer to one
     * carries no identifier. An answer without the figures is an unanswered read, never a zero.
     */
    async invoicePaymentStatus(series: string, number: string): Promise<InvoicePaymentStatus> {
        const config = this.readyConfig();
        const query = `cif=${encodeURIComponent(config.cif)}&seriesname=${encodeURIComponent(series)}&number=${encodeURIComponent(number)}`;
        const body = await this.call(config, 'GET', `/invoice/paymentstatus?${query}`, undefined, READ_TIMEOUT_MS);
        const status = readPaymentStatus(body);
        if (!status) {
            throw new SmartBillError('ambiguous', `SmartBill answered without the paid amount of ${series} ${number}.`);
        }
        return status;
    }

    /**
     * `POST /payment` — a collection on an invoice. Returns the receipt's number for a `Chitanta`,
     * nothing for a transfer, which SmartBill records without a document.
     *
     * The same last door as `issueInvoice`: outside production anything but a draft is refused
     * before it leaves. A collection is not a document for a transfer, but it is a line in the
     * school's accounts either way.
     */
    async recordPayment(payload: SmartBillPaymentRequest): Promise<RecordedPayment> {
        const config = this.readyConfig();
        if (payload.isDraft !== true && !mayIssueFiscalDocuments()) {
            throw new SmartBillError(
                'configuration',
                `Only a production backend records payments in SmartBill; NODE_ENV=${process.env.NODE_ENV ?? '(unset)'} sends drafts. Nothing was sent.`,
            );
        }
        const body = await this.call(config, 'POST', '/payment', payload, ISSUE_TIMEOUT_MS);
        const recorded = readRecordedPayment(body);
        // The same rule as an invoice's number, for the one collection that is a numbered document.
        if (payload.isDraft !== true && payload.type === 'Chitanta' && !recorded.number) {
            throw new SmartBillError('ambiguous', 'SmartBill confirmed the receipt without its number; the paid amount decides whether it exists.');
        }
        return recorded;
    }

    /**
     * The fiscal PDF, as SmartBill renders it.
     *
     * **`Accept: application/octet-stream`, never `application/pdf`** — the spec: "Valoarea cea mai
     * naturala e singura care nu merge: raspunsul e 406". And an unknown document is a 502 with an
     * nginx page, not an error envelope, so a failure here says nothing more than its status.
     */
    async invoicePdf(series: string, number: string): Promise<Buffer> {
        const config = this.readyConfig();
        const query = `cif=${encodeURIComponent(config.cif)}&seriesname=${encodeURIComponent(series)}&number=${encodeURIComponent(number)}`;
        const response = await this.send(config, 'GET', `/invoice/pdf?${query}`, undefined, READ_TIMEOUT_MS, 'application/octet-stream');
        if (!response.ok) {
            // The body is read for its `errorText`: the rate limit answers 403 with it, and without it
            // that 403 read as a wrong token — so the lock-out was never recorded, and every family
            // opening an invoice went on calling SmartBill through the ten minutes.
            const body: unknown = await response.json().catch(() => null);
            const kind = classifyFailure(response.status, body);
            if (kind === 'throttled') this.lockOut();
            throw new SmartBillError(kind, `SmartBill answered HTTP ${response.status} for the PDF of ${series} ${number}`, response.status);
        }
        return Buffer.from(await response.arrayBuffer());
    }

    /** The configuration, or a `configuration` failure naming what is missing. */
    private readyConfig(): SmartBillConfig & { cif: string } {
        const config = smartBillConfig();
        const missing = missingSmartBillSettings(config);
        if (missing.length > 0) {
            throw new SmartBillError('configuration', `SmartBill is not configured: ${missing.join(', ')} not set. Nothing was sent.`);
        }
        // The one guard that keeps a test from ever issuing a real document: under jest the
        // production host is refused outright, whatever the mode says. A suite that wants SmartBill
        // points `SMARTBILL_BASE_URL` at a fake.
        if (process.env.NODE_ENV === 'test' && config.baseUrl === SMARTBILL_DEFAULT_BASE_URL) {
            throw new SmartBillError('configuration', 'Refusing to call the production SmartBill API under NODE_ENV=test; point SMARTBILL_BASE_URL at a fake.');
        }
        return config as SmartBillConfig & { cif: string };
    }

    /** One JSON call: success envelope back, anything else as a classified `SmartBillError`. */
    private async call(config: SmartBillConfig, method: 'GET' | 'POST', path: string, payload: unknown, timeoutMs: number): Promise<unknown> {
        const response = await this.send(config, method, path, payload, timeoutMs, 'application/json');
        let body: unknown = null;
        let readable = true;
        try {
            body = await response.json();
        } catch {
            readable = false;
        }

        // A 2xx whose body never arrived whole: the connection dropped after the headers, or the
        // timeout fired while it was being read. `null` used to pass `isSuccess` — no `errorText` in
        // it — so a lost answer to `POST /invoice/v2` became a success with nothing in it. For an
        // issue request that is exactly an invoice nobody saw, and for a read, a failed read.
        if (response.ok && !readable) {
            throw new SmartBillError('ambiguous', `SmartBill answered HTTP ${response.status}, but its body could not be read.`, response.status);
        }

        if (isSuccess(response.status, body)) {
            return body;
        }

        const kind = classifyFailure(response.status, body);
        if (kind === 'throttled') this.lockOut();
        throw new SmartBillError(kind, describeFailure(response.status, body), response.status);
    }

    private lockOut(): void {
        this.lockedUntil = Date.now() + LOCKOUT_MS;
        this.logger.error(`Rate limit hit; not calling SmartBill again before ${new Date(this.lockedUntil).toISOString()}.`);
    }

    private async send(config: SmartBillConfig, method: 'GET' | 'POST', path: string, payload: unknown, timeoutMs: number, accept: string): Promise<Response> {
        if (this.lockedUntil > Date.now()) {
            throw new SmartBillError('throttled', `SmartBill is locked out until ${new Date(this.lockedUntil).toISOString()}; nothing was sent.`);
        }

        await this.takeSlot();
        // Again after the wait: a caller queued behind the one that hit the limit would otherwise go
        // out anyway, on the heels of the answer that said to stop.
        if (this.lockedUntil > Date.now()) {
            throw new SmartBillError('throttled', `SmartBill is locked out until ${new Date(this.lockedUntil).toISOString()}; nothing was sent.`);
        }

        // Basic auth from the e-mail and the API token. Neither is ever logged, nor is the header —
        // the spec says as much, and the token can issue invoices in the school's name.
        const credentials = Buffer.from(`${config.username}:${config.token}`).toString('base64');
        try {
            return await fetch(`${config.baseUrl}${path}`, {
                method,
                headers: {
                    authorization: `Basic ${credentials}`,
                    accept,
                    ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
                },
                ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
                signal: AbortSignal.timeout(timeoutMs),
            });
        } catch (error: unknown) {
            // A timeout, a DNS failure, a dropped connection. For a read that is only a failed read;
            // for `POST /invoice/v2` it is the case `reconcile` exists for — the request may have
            // become an invoice whose number we never saw.
            const reason = error instanceof Error ? error.message : String(error);
            throw new SmartBillError('ambiguous', `SmartBill could not be reached: ${reason}`);
        }
    }

    private async takeSlot(): Promise<void> {
        const previous = this.slot;
        let release: () => void = () => undefined;
        this.slot = new Promise<void>((resolve) => (release = resolve));
        try {
            await previous;
            const gap = this.lastCallAt + MIN_CALL_GAP_MS - Date.now();
            if (gap > 0) await pause(gap);
            this.lastCallAt = Date.now();
        } finally {
            release();
        }
    }
}

/** The objects in a list field of a V1 answer, whatever else the list holds. */
function entriesOf(body: unknown, field: string): Record<string, unknown>[] {
    const list: unknown = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[field] : undefined;
    if (!Array.isArray(list)) return [];
    return (list as unknown[]).filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null);
}

function pause(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
