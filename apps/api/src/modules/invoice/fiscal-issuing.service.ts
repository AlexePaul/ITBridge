import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import { Invoice, InvoiceFiscalStatus } from 'src/entities/invoice.entity';
import { Discount } from 'src/entities/discount.entity';
import { SmartBillService } from 'src/modules/smartbill/smartbill.service';
import {
    mayIssueFiscalDocuments,
    missingSmartBillSettings,
    smartBillConfig,
    type SmartBillConfig,
    type SmartBillMode,
} from 'src/modules/smartbill/smartbill.config';
import { invoicePayload, nextExpectedAfter, reconcile, SmartBillError, type IssuedDocument, type Reconciliation } from 'src/modules/smartbill/smartbill.rules';
import { S3Service } from 'src/modules/storage/s3.service';
import { AuditService, type Actor } from 'src/modules/audit/audit.service';
import { AuditAction } from 'src/enum/audit-action.enum';
import { toIsoDate } from 'src/modules/class-session/class-session.dates';
import { dueDateFor } from './arrears.rules';
import { CONFIGURATION_RETRY_MS, FISCAL_BATCH_SIZE, FISCAL_LEASE_MS, FISCAL_MAX_ATTEMPTS, fiscalBackoffFrom } from './fiscal-issuing.rules';
import { invoicePdfKey } from './invoice-pdf-key';

export interface FiscalDrainResult {
    /** Unanswered requests settled at the start of the pass. */
    reconciled: number;
    /** Rows the pass sent a request for. */
    sent: number;
    issued: number;
    drafts: number;
    refused: number;
    /** Rows handed to a person: the series moved while an answer was lost. */
    review: number;
    /** Why the pass stopped before the queue was empty, if it did. */
    stoppedBy: 'off' | 'configuration' | 'throttled' | 'in_flight' | 'unanswered' | null;
}

/**
 * The queue as the admin screen reads it — S3's "progres vizibil in interfata". The mode is part of
 * the answer on purpose: "în coadă" means one thing when the timer is sending and another when
 * `SMARTBILL_MODE` is `off`, and only the second is something the office should be told about.
 */
export interface FiscalQueueStatus {
    mode: SmartBillMode;
    /**
     * Settings the mode cannot work without — the credentials, and for `live` on a backend that is
     * not production, `NODE_ENV=production`. Empty when complete, and always empty in `off`.
     */
    missing: string[];
    series: string | null;
    /** When SmartBill's rate-limit lock-out ends, if this process is waiting one out. */
    lockedUntil: string | null;
    counts: Record<InvoiceFiscalStatus, number>;
}

/** Kept to the column's length; SmartBill's messages are short, a proxy's error page is not. */
const MAX_ERROR_LENGTH = 1000;

/**
 * Issues the platform's invoices through SmartBill — E16/S2, tempered as S3 asks.
 *
 * The invoice is written by the platform first, as it always was, with `fiscalStatus = pending`;
 * this service turns the pending ones into fiscal documents afterwards, off the request that issued
 * them. That is the outbox's shape and for the outbox's reason: an admin issuing a month must not
 * wait on SmartBill, and SmartBill being down must not undo the month.
 *
 * **One request in the air at a time, and nothing sent past one whose answer was lost.** SmartBill
 * has no idempotency key, so the only proof that a request did or did not become an invoice is its
 * series: `nextNumber` is read before the request and written on the row (`fiscalExpectedNumber`),
 * and a lost answer is settled by reading it again — see `reconcile`. That only works while nothing
 * else moves the series, which is why a row in the air stops every pass until it is settled, and
 * why the series must be the platform's own.
 *
 * The status changes here are consequences, not decisions, and so are not audited — the same line
 * `recomputeInvoiceStatus` draws. The two doors a person uses, `retry` and `confirmIssued`, are.
 */
@Injectable()
export class FiscalIssuingService {
    private readonly logger = new Logger('FiscalIssuing');

    constructor(
        @InjectRepository(Invoice) private readonly invoiceRepository: Repository<Invoice>,
        @InjectRepository(Discount) private readonly discountRepository: Repository<Discount>,
        private readonly dataSource: DataSource,
        private readonly smartBill: SmartBillService,
        private readonly s3: S3Service,
        private readonly audit: AuditService,
    ) {}

    /** Where the fiscal queue stands, over one month or over everything. */
    async status(monthIssued?: string, now: Date = new Date()): Promise<FiscalQueueStatus> {
        const config = smartBillConfig();
        const qb = this.invoiceRepository
            .createQueryBuilder('invoice')
            .select('invoice.fiscalStatus', 'fiscalStatus')
            .addSelect('COUNT(*)::int', 'count')
            .andWhere('invoice.fiscalStatus IS NOT NULL')
            .groupBy('invoice.fiscalStatus');
        if (monthIssued) qb.andWhere('invoice.monthIssued = :monthIssued', { monthIssued });
        const rows = await qb.getRawMany<{ fiscalStatus: InvoiceFiscalStatus; count: number }>();

        const counts = Object.fromEntries(Object.values(InvoiceFiscalStatus).map((state) => [state, 0])) as Record<InvoiceFiscalStatus, number>;
        for (const row of rows) counts[row.fiscalStatus] = Number(row.count);

        return {
            mode: config.mode,
            missing: blockersOf(config),
            series: config.invoiceSeries ?? null,
            lockedUntil: this.smartBill.lockedOutUntil(now)?.toISOString() ?? null,
            counts,
        };
    }

    /**
     * One pass: settle what went unanswered, then send what is due, in that order.
     *
     * Silent when there is nothing to do — the caller logs the pass, and only when it did something.
     */
    async drain(options: { now?: Date; batchSize?: number } = {}): Promise<FiscalDrainResult> {
        const now = options.now ?? new Date();
        // What the pass writes times with: its `now`, moved on by the real time since the pass
        // began. A lease is how long a request may be in the air, so it has to start when the
        // request does; stamped from the start of the pass, a batch that ran long handed its last
        // rows a lease that had already run out, and the next pass read the series seconds after a
        // timeout — before a slow SmartBill had finished writing. Moving `now`, rather than reading
        // the wall clock, keeps a test's `now` meaning what it says.
        const startedAt = Date.now();
        const clock = () => new Date(now.getTime() + (Date.now() - startedAt));
        const batchSize = options.batchSize ?? FISCAL_BATCH_SIZE;
        const result: FiscalDrainResult = { reconciled: 0, sent: 0, issued: 0, drafts: 0, refused: 0, review: 0, stoppedBy: null };

        const config = smartBillConfig();
        if (config.mode === 'off') {
            result.stoppedBy = 'off';
            return result;
        }
        // Before anything is claimed: a row taken only to be given back is a write for nothing, and
        // in `live` it would cost a read of the series too.
        if (blockersOf(config).length > 0) {
            result.stoppedBy = 'configuration';
            return result;
        }
        if (this.smartBill.lockedOutUntil(now)) {
            result.stoppedBy = 'throttled';
            return result;
        }

        // A request whose lease has not run out is still somebody's — this process's previous pass,
        // or a second process during a deploy. Its answer decides what the series means, so nothing
        // else goes up until it is in.
        const inFlight = await this.invoiceRepository.count({
            where: { fiscalStatus: InvoiceFiscalStatus.UNCERTAIN, fiscalNextAttemptAt: MoreThan(now) },
        });
        if (inFlight > 0) {
            result.stoppedBy = 'in_flight';
            return result;
        }

        const settled = await this.reconcileUnanswered(now, result);
        if (!settled) return result;

        let expected: number | null = null;
        for (let sent = 0; sent < batchSize; sent++) {
            const invoice = await this.claimNext(clock());
            if (!invoice) break;

            if (config.mode === 'live' && expected === null) {
                try {
                    expected = await this.smartBill.nextInvoiceNumber();
                } catch (error: unknown) {
                    // Nothing was sent: the row goes back as it was, with its attempt.
                    await this.giveBack(invoice, clock(), error, result);
                    return result;
                }
            }

            const outcome = await this.send(invoice, config.mode, expected, clock, result);
            if (outcome.stop) return result;
            expected = outcome.expected;
        }

        return result;
    }

    /**
     * Settles every request whose lease ran out without an answer. Returns false when the pass must
     * stop because the series could not be read — sending anything then would move it under the
     * rows that are waiting to be judged by it.
     */
    private async reconcileUnanswered(now: Date, result: FiscalDrainResult): Promise<boolean> {
        const stale = await this.invoiceRepository.find({
            where: { fiscalStatus: InvoiceFiscalStatus.UNCERTAIN, fiscalNextAttemptAt: LessThanOrEqual(now) },
            order: { fiscalNextAttemptAt: 'ASC', id: 'ASC' },
        });
        if (stale.length === 0) return true;

        let nextNumber: number | null = null;
        if (stale.some((invoice) => invoice.fiscalExpectedNumber !== null)) {
            try {
                nextNumber = await this.smartBill.nextInvoiceNumber();
            } catch (error: unknown) {
                result.stoppedBy = this.stopReasonFor(error);
                this.logger.warn(`Could not read the series to settle ${stale.length} unanswered request(s): ${messageOf(error)}`);
                return false;
            }
        }

        for (const invoice of stale) {
            // No expected number: the request was never sent — the number is written before the call
            // — or it was a draft, and a second draft is harmless. Either way, send it again.
            const decision: Reconciliation =
                invoice.fiscalExpectedNumber === null ? { outcome: 'not_sent' } : reconcile(invoice.fiscalExpectedNumber, nextNumber as number);

            if (decision.outcome === 'needs_review') {
                await this.settle(invoice, {
                    fiscalStatus: InvoiceFiscalStatus.REVIEW,
                    fiscalNextAttemptAt: null,
                    fiscalLastError: decision.reason,
                });
                result.review++;
                this.logger.error(`Invoice ${invoice.id}: answer lost and the series moved; handed to a person. ${decision.reason}`);
            } else if (decision.outcome === 'not_created' && invoice.fiscalAttempts >= FISCAL_MAX_ATTEMPTS) {
                await this.settle(invoice, {
                    fiscalStatus: InvoiceFiscalStatus.FAILED,
                    fiscalNextAttemptAt: null,
                    fiscalExpectedNumber: null,
                    fiscalLastError:
                        `SmartBill nu a răspuns după ${invoice.fiscalAttempts} încercări; factura nu a fost emisă. ${invoice.fiscalLastError ?? ''}`.trim(),
                });
                result.refused++;
            } else {
                // A request that never went up is sent again straight away; one that went up and did
                // not become an invoice waits out the backoff, since SmartBill was the one not answering.
                await this.settle(invoice, {
                    fiscalStatus: InvoiceFiscalStatus.PENDING,
                    fiscalNextAttemptAt: decision.outcome === 'not_sent' ? now : fiscalBackoffFrom(now, invoice.fiscalAttempts),
                    fiscalExpectedNumber: null,
                });
            }
            result.reconciled++;
        }
        return true;
    }

    /**
     * Takes the next due row, and marks it as in the air *before* anything is sent.
     *
     * `FOR UPDATE SKIP LOCKED`, as the outbox claims: a second process skips the row this one holds
     * instead of sending it too. The lease on `fiscalNextAttemptAt` is what the in-flight check
     * reads, and `fiscalAttempts` doubles as the row's version: every write after the claim is
     * conditional on it, so a pass that lost the row cannot overwrite what the next one did.
     */
    private async claimNext(now: Date): Promise<Invoice | null> {
        return this.dataSource.transaction(async (manager) => {
            const due = await manager
                .createQueryBuilder(Invoice, 'invoice')
                .setLock('pessimistic_write')
                .setOnLocked('skip_locked')
                .andWhere('invoice.fiscalStatus = :status', { status: InvoiceFiscalStatus.PENDING })
                .andWhere('invoice.fiscalNextAttemptAt <= :now', { now })
                .orderBy('invoice.fiscalNextAttemptAt', 'ASC')
                .addOrderBy('invoice.id', 'ASC')
                .limit(1)
                .getOne();
            if (!due) return null;

            due.fiscalStatus = InvoiceFiscalStatus.UNCERTAIN;
            due.fiscalAttempts += 1;
            due.fiscalNextAttemptAt = new Date(now.getTime() + FISCAL_LEASE_MS);
            due.fiscalExpectedNumber = null;
            await manager.update(Invoice, due.id, {
                fiscalStatus: due.fiscalStatus,
                fiscalAttempts: due.fiscalAttempts,
                fiscalNextAttemptAt: due.fiscalNextAttemptAt,
                fiscalExpectedNumber: null,
            });
            return due;
        });
    }

    /**
     * Sends one claimed row and writes down what came back. `expected` is the series' next number
     * in `live`, `null` in `draft`; the answer is the next row's `expected`.
     */
    private async send(
        invoice: Invoice,
        mode: SmartBillMode,
        expected: number | null,
        clock: () => Date,
        result: FiscalDrainResult,
    ): Promise<{ stop: boolean; expected: number | null }> {
        const withParent = await this.invoiceRepository.findOne({ where: { id: invoice.id }, relations: { parent: true } });
        if (!withParent?.parent) {
            await this.settle(invoice, {
                fiscalStatus: InvoiceFiscalStatus.FAILED,
                fiscalNextAttemptAt: null,
                fiscalLastError: 'Factura nu mai are o familie atașată; nu s-a trimis nimic.',
            });
            result.refused++;
            return { stop: false, expected };
        }

        const discounts = await this.discountRepository.find({ where: { parent: { id: withParent.parent.id }, monthIssued: withParent.monthIssued } });
        const payload = invoicePayload(
            {
                invoiceId: withParent.id,
                amount: withParent.amount,
                issueDate: toIsoDate(withParent.dateIssued),
                dueDate: toIsoDate(dueDateFor(withParent.dateIssued)),
                monthIssued: withParent.monthIssued,
                client: { name: `${withParent.parent.lastName} ${withParent.parent.firstName}`.trim(), address: withParent.parent.address?.trim() || null },
                discounts: discounts.map((discount) => ({ name: discount.name, type: discount.type, value: discount.value })),
            },
            smartBillConfig(),
            mode === 'draft',
        );

        // The number and a fresh lease go on the row before the request goes out: from here on, a
        // crash leaves a row that says "sent, answer unknown", which is exactly what it is, and the
        // lease counts from this request rather than from whenever the pass began.
        //
        // The write is conditional on the attempt this pass claimed, and if it matched nothing the
        // row is somebody else's now — a second process settled it and took it again. Sending anyway
        // would be two requests for one invoice, so nothing goes up.
        const leased = await this.settle(invoice, {
            fiscalExpectedNumber: expected,
            fiscalNextAttemptAt: new Date(clock().getTime() + FISCAL_LEASE_MS),
        });
        if (leased === 0) {
            result.stoppedBy = 'in_flight';
            this.logger.warn(`Invoice ${invoice.id} changed hands before it was sent; nothing went up, and the pass stops.`);
            return { stop: true, expected: null };
        }
        invoice.fiscalExpectedNumber = expected;

        result.sent++;
        let document: IssuedDocument;
        try {
            document = await this.smartBill.issueInvoice(payload);
        } catch (error: unknown) {
            return this.recordFailure(invoice, error, clock(), expected, result);
        }

        if (mode === 'draft') {
            await this.settle(invoice, {
                fiscalStatus: InvoiceFiscalStatus.DRAFT,
                fiscalDocumentId: document.documentId,
                fiscalDocumentUrl: document.documentUrl,
                fiscalIssuedAt: new Date(),
                fiscalNextAttemptAt: null,
                fiscalLastError: null,
            });
            result.drafts++;
            return { stop: false, expected: null };
        }

        await this.settle(invoice, {
            fiscalStatus: InvoiceFiscalStatus.ISSUED,
            fiscalSeries: document.series,
            fiscalNumber: document.number,
            fiscalDocumentId: document.documentId,
            fiscalDocumentUrl: document.documentUrl,
            fiscalViewUrl: document.documentViewUrl,
            fiscalIssuedAt: new Date(),
            fiscalNextAttemptAt: null,
            fiscalLastError: null,
        });
        result.issued++;
        this.logger.log(`Invoice ${invoice.id} issued in SmartBill as ${document.series ?? '?'} ${document.number ?? '?'}.`);

        if (document.series && document.number) {
            await this.storeFiscalPdf(withParent, document.series, document.number);
        }
        return { stop: false, expected: nextExpectedAfter(document.number) };
    }

    /** Writes a failed request down according to its kind — see `SmartBillFailureKind`. */
    private async recordFailure(
        invoice: Invoice,
        error: unknown,
        now: Date,
        expected: number | null,
        result: FiscalDrainResult,
    ): Promise<{ stop: boolean; expected: number | null }> {
        const reason = messageOf(error).slice(0, MAX_ERROR_LENGTH);
        const kind = error instanceof SmartBillError ? error.kind : 'ambiguous';

        if (kind === 'refused') {
            // Definitely not issued, so the series did not move and the next row keeps `expected`.
            await this.settle(invoice, {
                fiscalStatus: InvoiceFiscalStatus.FAILED,
                fiscalNextAttemptAt: null,
                fiscalExpectedNumber: null,
                fiscalLastError: reason,
            });
            result.refused++;
            this.logger.error(`Invoice ${invoice.id} refused by SmartBill: ${reason}`);
            return { stop: false, expected };
        }

        if (kind === 'ambiguous') {
            // The one case that can mean an invoice nobody saw. The row stays in the air until its
            // lease runs out, and then the series decides. Nothing else is sent meanwhile.
            await this.settle(invoice, { fiscalLastError: reason });
            result.stoppedBy = 'unanswered';
            this.logger.warn(`Invoice ${invoice.id}: no answer from SmartBill (${reason}); settling it from the series after the lease.`);
            return { stop: true, expected: null };
        }

        await this.giveBack(invoice, now, error, result);
        return { stop: true, expected: null };
    }

    /**
     * A configuration failure or a lock-out: nothing was issued, and the invoice did nothing wrong.
     * It goes back to the queue with its attempt returned — the lesson `recordFailure` in the outbox
     * paid for: a failure of setup that spends attempts buries its own queue before the fix lands.
     */
    private async giveBack(invoice: Invoice, now: Date, error: unknown, result: FiscalDrainResult): Promise<void> {
        const stoppedBy = this.stopReasonFor(error);
        const lockedUntil = this.smartBill.lockedOutUntil(now);
        await this.settle(invoice, {
            fiscalStatus: InvoiceFiscalStatus.PENDING,
            fiscalAttempts: Math.max(0, invoice.fiscalAttempts - 1),
            fiscalNextAttemptAt: stoppedBy === 'throttled' && lockedUntil ? lockedUntil : new Date(now.getTime() + CONFIGURATION_RETRY_MS),
            fiscalExpectedNumber: null,
            fiscalLastError: messageOf(error).slice(0, MAX_ERROR_LENGTH),
        });
        result.stoppedBy = stoppedBy;
        this.logger.warn(`Fiscal queue paused (${stoppedBy}): ${messageOf(error)}`);
    }

    private stopReasonFor(error: unknown): FiscalDrainResult['stoppedBy'] {
        if (error instanceof SmartBillError && error.kind === 'throttled') return 'throttled';
        if (error instanceof SmartBillError && error.kind === 'ambiguous') return 'unanswered';
        return 'configuration';
    }

    /**
     * One conditional write. Conditional on the attempt count the row was claimed with, so a pass
     * that is somehow late cannot overwrite a newer claim.
     */
    private async settle(invoice: Invoice, changes: Partial<Invoice>): Promise<number> {
        const outcome = await this.invoiceRepository
            .createQueryBuilder()
            .update(Invoice)
            .set(changes)
            .andWhere('id = :id', { id: invoice.id })
            .andWhere('"fiscalAttempts" = :attempts', { attempts: invoice.fiscalAttempts })
            .execute();
        if (changes.fiscalAttempts !== undefined) invoice.fiscalAttempts = changes.fiscalAttempts;
        return outcome.affected ?? 0;
    }

    /**
     * Keeps SmartBill's PDF where the family's invoice PDF has always lived.
     *
     * Same key as the locally generated one, so the export, the erasure and everything else that
     * reads "the invoice's PDF" keeps reading it without knowing who made it. Best effort: an
     * invoice is issued whether or not its PDF could be fetched this second, and `getInvoicePdf`
     * fetches it on first ask when it is missing.
     */
    async storeFiscalPdf(invoice: Pick<Invoice, 'id' | 'monthIssued'>, series: string, number: string): Promise<Buffer | null> {
        try {
            const pdf = await this.smartBill.invoicePdf(series, number);
            await this.s3.putObject({ key: invoicePdfKey(invoice.monthIssued, invoice.id), body: pdf, contentType: 'application/pdf' });
            return pdf;
        } catch (error: unknown) {
            this.logger.warn(`Invoice ${invoice.id}: could not keep SmartBill's PDF yet (${messageOf(error)}); it is fetched on first download.`);
            return null;
        }
    }

    /**
     * "Send it again" — for a refused invoice once the cause is fixed, or for one under review once a
     * person has looked in SmartBill and found nothing issued.
     *
     * Only from those two states. A `pending` one is already queued, an `issued` one would become a
     * second fiscal document for the same month, and one in the air is being answered.
     */
    async retry(invoiceId: number, actor: Actor): Promise<Invoice> {
        return this.dataSource.transaction(async (manager) => {
            const invoice = await manager.findOne(Invoice, { where: { id: invoiceId }, lock: { mode: 'pessimistic_write' } });
            if (!invoice) throw new NotFoundException('Invoice not found');
            if (invoice.fiscalStatus !== InvoiceFiscalStatus.FAILED && invoice.fiscalStatus !== InvoiceFiscalStatus.REVIEW) {
                throw new ConflictException({
                    message: `Invoice ${invoiceId} is ${invoice.fiscalStatus ?? 'not queued for SmartBill'}; only a refused invoice or one under review can be sent again.`,
                    error: 'FISCAL_NOT_RETRYABLE',
                });
            }

            const before = invoice.fiscalStatus;
            await manager.update(Invoice, invoice.id, {
                fiscalStatus: InvoiceFiscalStatus.PENDING,
                fiscalNextAttemptAt: new Date(),
                fiscalAttempts: 0,
                fiscalExpectedNumber: null,
                fiscalLastError: null,
            });
            await this.audit.record(
                {
                    actor,
                    action: AuditAction.UPDATED,
                    entityType: 'Invoice',
                    entityId: invoice.id,
                    changes: { fiscalStatus: { from: before, to: InvoiceFiscalStatus.PENDING } },
                    note:
                        before === InvoiceFiscalStatus.REVIEW
                            ? 'Retrimisă în SmartBill după verificare: factura nu fusese emisă.'
                            : 'Retrimisă în SmartBill după un refuz.',
                },
                manager,
            );
            return manager.findOneOrFail(Invoice, { where: { id: invoice.id } });
        });
    }

    /**
     * "It is there, and this is its number" — the way out of `REVIEW` when the invoice was issued.
     *
     * The number is what the person read in SmartBill, typed or accepted from the suggestion; the
     * series is the platform's. This is a person vouching for a fiscal record, so it is audited, and
     * refused from any other state.
     */
    async confirmIssued(invoiceId: number, number: string, actor: Actor): Promise<Invoice> {
        const series = smartBillConfig().invoiceSeries;
        if (!series) {
            throw new ConflictException({
                message: 'SMARTBILL_INVOICE_SERIES is not set; there is no series to confirm a number on.',
                error: 'FISCAL_NOT_CONFIGURED',
            });
        }

        const confirmed = await this.dataSource.transaction(async (manager) => {
            const invoice = await manager.findOne(Invoice, { where: { id: invoiceId }, lock: { mode: 'pessimistic_write' } });
            if (!invoice) throw new NotFoundException('Invoice not found');
            if (invoice.fiscalStatus !== InvoiceFiscalStatus.REVIEW) {
                throw new ConflictException({
                    message: `Invoice ${invoiceId} is ${invoice.fiscalStatus ?? 'not queued for SmartBill'}; only one under review can be confirmed.`,
                    error: 'FISCAL_NOT_UNDER_REVIEW',
                });
            }

            await manager.update(Invoice, invoice.id, {
                fiscalStatus: InvoiceFiscalStatus.ISSUED,
                fiscalSeries: series,
                fiscalNumber: number,
                fiscalIssuedAt: new Date(),
                fiscalNextAttemptAt: null,
                fiscalLastError: null,
            });
            await this.audit.record(
                {
                    actor,
                    action: AuditAction.UPDATED,
                    entityType: 'Invoice',
                    entityId: invoice.id,
                    changes: {
                        fiscalStatus: { from: InvoiceFiscalStatus.REVIEW, to: InvoiceFiscalStatus.ISSUED },
                        fiscalNumber: { from: null, to: `${series} ${number}` },
                    },
                    note: 'Numărul fiscal confirmat de mână, după un răspuns pierdut de la SmartBill.',
                },
                manager,
            );
            return manager.findOneOrFail(Invoice, { where: { id: invoice.id } });
        });

        await this.storeFiscalPdf(confirmed, series, number);
        return confirmed;
    }
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * What keeps the queue from moving in the configured mode: the settings it lacks and, for `live`
 * on a backend that is not production, `NODE_ENV=production`. One list for the screen and for
 * `drain`, so the office reads the same reason the timer stopped on.
 */
function blockersOf(config: SmartBillConfig): string[] {
    if (config.mode === 'off') return [];
    const blockers = missingSmartBillSettings(config);
    if (config.mode === 'live' && !mayIssueFiscalDocuments()) blockers.push('NODE_ENV=production');
    return blockers;
}
