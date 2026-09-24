import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual, MoreThan, Repository } from 'typeorm';
import { Payment, PaymentFiscalStatus } from 'src/entities/payment.entity';
import { InvoiceFiscalStatus } from 'src/entities/invoice.entity';
import { PaymentMethod } from 'src/enum/payment-method.enum';
import { AuditAction } from 'src/enum/audit-action.enum';
import { AuditService, type Actor } from 'src/modules/audit/audit.service';
import { SmartBillService } from 'src/modules/smartbill/smartbill.service';
import {
    mayIssueFiscalDocuments,
    missingSmartBillSettings,
    smartBillConfig,
    type SmartBillConfig,
    type SmartBillMode,
} from 'src/modules/smartbill/smartbill.config';
import { SmartBillError } from 'src/modules/smartbill/smartbill.rules';
import { paymentPayload, reconcilePayment, type InvoicePaymentStatus, type RecordedPayment } from 'src/modules/smartbill/smartbill-payment.rules';
import { CONFIGURATION_RETRY_MS, FISCAL_BATCH_SIZE, FISCAL_LEASE_MS, FISCAL_MAX_ATTEMPTS, fiscalBackoffFrom } from 'src/modules/invoice/fiscal-issuing.rules';
import { toIsoDate } from 'src/modules/class-session/class-session.dates';
import { owesSmartBillRecord } from './payment-fiscal.rules';

export interface PaymentFiscalDrainResult {
    /** Unanswered requests settled at the start of the pass. */
    reconciled: number;
    /** Rows the pass sent a request for. */
    sent: number;
    recorded: number;
    refused: number;
    /** Rows handed to a person: the invoice's paid amount moved while an answer was lost. */
    review: number;
    /** Why the pass stopped before the queue was empty, if it did. */
    stoppedBy: 'off' | 'configuration' | 'throttled' | 'in_flight' | 'unanswered' | null;
}

/** The payments' side of the fiscal queue, as the admin screen reads it. */
export interface PaymentFiscalQueueStatus {
    mode: SmartBillMode;
    /** What keeps the queue from moving; empty when nothing does, and always empty outside `live`. */
    missing: string[];
    receiptSeries: string | null;
    lockedUntil: string | null;
    /** Pending payments whose invoice SmartBill has not numbered yet: they go after it does. */
    waitingForInvoice: number;
    counts: Record<PaymentFiscalStatus, number>;
}

/** Kept to the column's length; SmartBill's messages are short, a proxy's error page is not. */
const MAX_ERROR_LENGTH = 1000;

/**
 * Records the platform's payments in SmartBill — E16/S5, with S6's document for cash.
 *
 * The admin records money once, here; this turns each succeeded payment into a collection on the
 * invoice in SmartBill afterwards, off the request — "un singur loc de introducere, nu două". Cash
 * becomes a numbered receipt on the platform's receipt series; a transfer, a collection by payment
 * order, which SmartBill keeps without a document.
 *
 * **The invoice queue's shape, with a different proof.** SmartBill has no idempotency key, and the
 * answer to a transfer carries no identifier at all, so the proof that a request did or did not
 * become a collection is the invoice's paid amount: read before the request, written on the row
 * (`fiscalExpectedPaid`), read again after a lost answer. Unchanged, nothing was recorded and the
 * payment goes again; moved by exactly this payment, a person confirms — see `reconcilePayment`.
 * For a receipt the series is read too, for the number it would have taken.
 *
 * One request in the air at a time, and nothing sent past one whose answer was lost: the paid
 * amount is only proof while nothing else moves it, which is also why nobody records collections
 * by hand on the platform's invoices.
 *
 * Only in `live`: a draft invoice has no number to record a collection on (see `owesSmartBillRecord`).
 */
@Injectable()
export class PaymentFiscalService {
    private readonly logger = new Logger('PaymentFiscal');

    constructor(
        @InjectRepository(Payment) private readonly paymentRepository: Repository<Payment>,
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly smartBill: SmartBillService,
        private readonly audit: AuditService,
    ) {}

    async status(now: Date = new Date()): Promise<PaymentFiscalQueueStatus> {
        const config = smartBillConfig();
        const rows = await this.paymentRepository
            .createQueryBuilder('payment')
            .select('payment.fiscalStatus', 'fiscalStatus')
            .addSelect('COUNT(*)::int', 'count')
            .andWhere('payment.fiscalStatus IS NOT NULL')
            .groupBy('payment.fiscalStatus')
            .getRawMany<{ fiscalStatus: PaymentFiscalStatus; count: number }>();

        const counts = Object.fromEntries(Object.values(PaymentFiscalStatus).map((state) => [state, 0])) as Record<PaymentFiscalStatus, number>;
        for (const row of rows) counts[row.fiscalStatus] = Number(row.count);

        const waitingForInvoice = await this.paymentRepository
            .createQueryBuilder('payment')
            .innerJoin('payment.invoice', 'invoice')
            .andWhere('payment.fiscalStatus = :pending', { pending: PaymentFiscalStatus.PENDING })
            .andWhere('(invoice.fiscalStatus IS NULL OR invoice.fiscalStatus <> :issued)', { issued: InvoiceFiscalStatus.ISSUED })
            .getCount();

        return {
            mode: config.mode,
            missing: blockersOf(config),
            receiptSeries: config.receiptSeries ?? null,
            lockedUntil: this.smartBill.lockedOutUntil(now)?.toISOString() ?? null,
            waitingForInvoice,
            counts,
        };
    }

    /** One pass: settle what went unanswered, then send what is due, in that order. */
    async drain(options: { now?: Date; batchSize?: number } = {}): Promise<PaymentFiscalDrainResult> {
        const now = options.now ?? new Date();
        const batchSize = options.batchSize ?? FISCAL_BATCH_SIZE;
        const result: PaymentFiscalDrainResult = { reconciled: 0, sent: 0, recorded: 0, refused: 0, review: 0, stoppedBy: null };

        const config = smartBillConfig();
        if (config.mode !== 'live') {
            result.stoppedBy = 'off';
            return result;
        }
        if (blockersOf(config).length > 0) {
            result.stoppedBy = 'configuration';
            return result;
        }
        if (this.smartBill.lockedOutUntil(now)) {
            result.stoppedBy = 'throttled';
            return result;
        }

        // A request whose lease has not run out is still somebody's. Its answer decides what the paid
        // amount means, so nothing else goes up until it is in.
        const inFlight = await this.paymentRepository.count({
            where: { fiscalStatus: PaymentFiscalStatus.UNCERTAIN, fiscalNextAttemptAt: MoreThan(now) },
        });
        if (inFlight > 0) {
            result.stoppedBy = 'in_flight';
            return result;
        }

        if (!(await this.reconcileUnanswered(now, result))) return result;

        for (let sent = 0; sent < batchSize; sent++) {
            const payment = await this.claimNext(now);
            if (!payment) break;
            if (await this.send(payment, config, now, result)) return result;
        }
        return result;
    }

    /**
     * Settles every request whose lease ran out without an answer. False when the pass must stop
     * because the evidence could not be read — sending anything then could move it under a row that
     * is waiting to be judged by it.
     */
    private async reconcileUnanswered(now: Date, result: PaymentFiscalDrainResult): Promise<boolean> {
        const stale = await this.paymentRepository.find({
            where: { fiscalStatus: PaymentFiscalStatus.UNCERTAIN, fiscalNextAttemptAt: LessThanOrEqual(now) },
            relations: { invoice: true },
            order: { fiscalNextAttemptAt: 'ASC', id: 'ASC' },
        });

        for (const payment of stale) {
            let decision: ReturnType<typeof reconcilePayment> = { outcome: 'not_sent' };
            // No paid amount written: the request never went out — the evidence is written before
            // the call — so there is nothing to read.
            if (payment.fiscalExpectedPaid !== null) {
                try {
                    const status = await this.smartBill.invoicePaymentStatus(payment.invoice.fiscalSeries ?? '', payment.invoice.fiscalNumber ?? '');
                    const nextNumberNow = payment.fiscalExpectedNumber !== null ? await this.smartBill.nextReceiptNumber() : null;
                    decision = reconcilePayment({
                        expectedPaid: payment.fiscalExpectedPaid,
                        paidNow: status.paid,
                        value: payment.amount,
                        expectedNumber: payment.fiscalExpectedNumber,
                        nextNumberNow,
                    });
                } catch (error: unknown) {
                    result.stoppedBy = stopReasonFor(error);
                    this.logger.warn(`Could not read SmartBill to settle payment ${payment.id}: ${messageOf(error)}`);
                    return false;
                }
            }

            if (decision.outcome === 'needs_review') {
                await this.settle(payment, {
                    fiscalStatus: PaymentFiscalStatus.REVIEW,
                    fiscalNextAttemptAt: null,
                    fiscalExpectedNumber: decision.probableNumber,
                    fiscalLastError: decision.reason,
                });
                result.review++;
                this.logger.error(`Payment ${payment.id}: answer lost and the invoice's paid amount moved; handed to a person.`);
            } else if (decision.outcome === 'not_recorded' && payment.fiscalAttempts >= FISCAL_MAX_ATTEMPTS) {
                await this.settle(payment, {
                    fiscalStatus: PaymentFiscalStatus.FAILED,
                    fiscalNextAttemptAt: null,
                    fiscalExpectedPaid: null,
                    fiscalExpectedNumber: null,
                    fiscalLastError:
                        `SmartBill nu a răspuns după ${payment.fiscalAttempts} încercări; încasarea nu a fost înregistrată. ${payment.fiscalLastError ?? ''}`.trim(),
                });
                result.refused++;
            } else {
                await this.settle(payment, {
                    fiscalStatus: PaymentFiscalStatus.PENDING,
                    fiscalNextAttemptAt: decision.outcome === 'not_sent' ? now : fiscalBackoffFrom(now, payment.fiscalAttempts),
                    fiscalExpectedPaid: null,
                    fiscalExpectedNumber: null,
                });
            }
            result.reconciled++;
        }
        return true;
    }

    /**
     * Takes the next due payment whose invoice SmartBill has numbered, and marks it as in the air
     * before anything is asked. `FOR UPDATE OF payment SKIP LOCKED`: the invoice row is joined to
     * filter on, never locked — an admin recording money against it must not wait on the queue.
     */
    private async claimNext(now: Date): Promise<Payment | null> {
        return this.dataSource.transaction(async (manager) => {
            const due = await manager
                .createQueryBuilder(Payment, 'payment')
                .innerJoinAndSelect('payment.invoice', 'invoice')
                .setLock('pessimistic_write', undefined, ['payment'])
                .setOnLocked('skip_locked')
                .andWhere('payment.fiscalStatus = :status', { status: PaymentFiscalStatus.PENDING })
                .andWhere('payment.fiscalNextAttemptAt <= :now', { now })
                .andWhere('invoice.fiscalStatus = :issued', { issued: InvoiceFiscalStatus.ISSUED })
                .orderBy('payment.fiscalNextAttemptAt', 'ASC')
                .addOrderBy('payment.id', 'ASC')
                .limit(1)
                .getOne();
            if (!due) return null;

            due.fiscalStatus = PaymentFiscalStatus.UNCERTAIN;
            due.fiscalAttempts += 1;
            due.fiscalNextAttemptAt = new Date(now.getTime() + FISCAL_LEASE_MS);
            due.fiscalExpectedPaid = null;
            due.fiscalExpectedNumber = null;
            await manager.update(Payment, due.id, {
                fiscalStatus: due.fiscalStatus,
                fiscalAttempts: due.fiscalAttempts,
                fiscalNextAttemptAt: due.fiscalNextAttemptAt,
                fiscalExpectedPaid: null,
                fiscalExpectedNumber: null,
            });
            return due;
        });
    }

    /** Sends one claimed payment and writes down what came back. True when the pass must stop. */
    private async send(payment: Payment, config: SmartBillConfig, now: Date, result: PaymentFiscalDrainResult): Promise<boolean> {
        const series = payment.invoice.fiscalSeries;
        const number = payment.invoice.fiscalNumber;
        if (!series || !number) {
            // An issued invoice always has both; this is a row somebody edited by hand.
            await this.settle(payment, {
                fiscalStatus: PaymentFiscalStatus.FAILED,
                fiscalNextAttemptAt: null,
                fiscalLastError: 'Factura nu are serie și număr fiscal; încasarea nu are pe ce să fie înregistrată.',
            });
            result.refused++;
            return false;
        }

        // The evidence, before anything is sent: what the invoice counts as paid, and for a receipt,
        // the number the series would give it. A failed read sends nothing.
        let before: InvoicePaymentStatus;
        let expectedNumber: number | null = null;
        try {
            before = await this.smartBill.invoicePaymentStatus(series, number);
            if (payment.method === PaymentMethod.CASH) expectedNumber = await this.smartBill.nextReceiptNumber();
        } catch (error: unknown) {
            if (error instanceof SmartBillError && error.kind === 'refused') {
                // SmartBill does not know the invoice — it was deleted or cancelled there. Nothing
                // recorded, and sending would be refused the same way: a person looks.
                await this.settle(payment, {
                    fiscalStatus: PaymentFiscalStatus.FAILED,
                    fiscalNextAttemptAt: null,
                    fiscalLastError: `SmartBill nu găsește factura ${series} ${number}: ${messageOf(error)}`.slice(0, MAX_ERROR_LENGTH),
                });
                result.refused++;
                return false;
            }
            await this.giveBack(payment, now, error, result);
            return true;
        }

        // Written before the request goes out: from here on, a crash leaves a row that says "sent,
        // answer unknown", with the paid amount it will be judged by.
        await this.settle(payment, { fiscalExpectedPaid: before.paid, fiscalExpectedNumber: expectedNumber });
        payment.fiscalExpectedPaid = before.paid;
        payment.fiscalExpectedNumber = expectedNumber;

        const payload = paymentPayload(
            { paymentId: payment.id, amount: payment.amount, date: toIsoDate(payment.date), method: payment.method, invoice: { series, number } },
            config,
        );

        result.sent++;
        let recorded: RecordedPayment;
        try {
            recorded = await this.smartBill.recordPayment(payload);
        } catch (error: unknown) {
            return this.recordFailure(payment, error, now, result);
        }

        await this.settle(payment, {
            fiscalStatus: PaymentFiscalStatus.RECORDED,
            fiscalReceiptSeries: recorded.series,
            fiscalReceiptNumber: recorded.number,
            fiscalRecordedAt: new Date(),
            fiscalNextAttemptAt: null,
            fiscalLastError: null,
        });
        result.recorded++;
        this.logger.log(
            `Payment ${payment.id} recorded in SmartBill on ${series} ${number}${recorded.number ? `, receipt ${recorded.series ?? '?'} ${recorded.number}` : ''}.`,
        );
        return false;
    }

    /** Writes a failed request down according to its kind. True when the pass must stop. */
    private async recordFailure(payment: Payment, error: unknown, now: Date, result: PaymentFiscalDrainResult): Promise<boolean> {
        const reason = messageOf(error).slice(0, MAX_ERROR_LENGTH);
        const kind = error instanceof SmartBillError ? error.kind : 'ambiguous';

        if (kind === 'refused') {
            await this.settle(payment, {
                fiscalStatus: PaymentFiscalStatus.FAILED,
                fiscalNextAttemptAt: null,
                fiscalExpectedPaid: null,
                fiscalExpectedNumber: null,
                fiscalLastError: reason,
            });
            result.refused++;
            this.logger.error(`Payment ${payment.id} refused by SmartBill: ${reason}`);
            return false;
        }

        if (kind === 'ambiguous') {
            // The case that can mean a collection nobody saw: the row stays in the air until its lease
            // runs out, and then the paid amount decides. Nothing else is sent meanwhile.
            await this.settle(payment, { fiscalLastError: reason });
            result.stoppedBy = 'unanswered';
            this.logger.warn(`Payment ${payment.id}: no answer from SmartBill (${reason}); settling it from the paid amount after the lease.`);
            return true;
        }

        await this.giveBack(payment, now, error, result);
        return true;
    }

    /**
     * Nothing was sent: a configuration failure, a lock-out or a failed read. The payment goes back
     * with its attempt returned — the outbox's lesson, again.
     */
    private async giveBack(payment: Payment, now: Date, error: unknown, result: PaymentFiscalDrainResult): Promise<void> {
        const stoppedBy = stopReasonFor(error);
        const lockedUntil = this.smartBill.lockedOutUntil(now);
        await this.settle(payment, {
            fiscalStatus: PaymentFiscalStatus.PENDING,
            fiscalAttempts: Math.max(0, payment.fiscalAttempts - 1),
            fiscalNextAttemptAt: stoppedBy === 'throttled' && lockedUntil ? lockedUntil : new Date(now.getTime() + CONFIGURATION_RETRY_MS),
            fiscalExpectedPaid: null,
            fiscalExpectedNumber: null,
            fiscalLastError: messageOf(error).slice(0, MAX_ERROR_LENGTH),
        });
        result.stoppedBy = stoppedBy;
        this.logger.warn(`Payment queue paused (${stoppedBy}): ${messageOf(error)}`);
    }

    /** One conditional write, keyed on the attempt count the row was claimed with. */
    private async settle(payment: Payment, changes: Partial<Payment>): Promise<void> {
        await this.paymentRepository
            .createQueryBuilder()
            .update(Payment)
            .set(changes)
            .andWhere('id = :id', { id: payment.id })
            .andWhere('"fiscalAttempts" = :attempts', { attempts: payment.fiscalAttempts })
            .execute();
        if (changes.fiscalAttempts !== undefined) payment.fiscalAttempts = changes.fiscalAttempts;
    }

    /**
     * "Send it again" — for a refused payment once the cause is fixed, for one under review once a
     * person has found nothing in SmartBill, and for a payment that owes a record but has none (the
     * mode was switched to `live` after it was entered).
     */
    async retry(paymentId: number, actor: Actor): Promise<Payment> {
        return this.dataSource.transaction(async (manager) => {
            const locked = await manager.findOne(Payment, { where: { id: paymentId }, lock: { mode: 'pessimistic_write' } });
            if (!locked) throw new NotFoundException('Payment not found');
            const payment = await manager.findOneOrFail(Payment, { where: { id: paymentId }, relations: { invoice: true } });

            const before = payment.fiscalStatus;
            const retryable =
                before === PaymentFiscalStatus.FAILED ||
                before === PaymentFiscalStatus.REVIEW ||
                (before === null &&
                    owesSmartBillRecord({ mode: smartBillConfig().mode, paymentStatus: payment.status, invoiceFiscalStatus: payment.invoice.fiscalStatus }));
            if (!retryable) {
                throw new ConflictException({
                    message: `Payment ${paymentId} is ${before ?? 'not owed to SmartBill'}; only a refused payment, one under review, or one that owes a record can be sent again.`,
                    error: 'PAYMENT_FISCAL_NOT_RETRYABLE',
                });
            }

            await manager.update(Payment, payment.id, {
                fiscalStatus: PaymentFiscalStatus.PENDING,
                fiscalNextAttemptAt: new Date(),
                fiscalAttempts: 0,
                fiscalExpectedPaid: null,
                fiscalExpectedNumber: null,
                fiscalLastError: null,
            });
            await this.audit.record(
                {
                    actor,
                    action: AuditAction.UPDATED,
                    entityType: 'Payment',
                    entityId: payment.id,
                    changes: { fiscalStatus: { from: before, to: PaymentFiscalStatus.PENDING } },
                    note:
                        before === PaymentFiscalStatus.REVIEW
                            ? 'Retrimisă în SmartBill după verificare: încasarea nu fusese înregistrată.'
                            : before === PaymentFiscalStatus.FAILED
                              ? 'Retrimisă în SmartBill după un refuz.'
                              : 'Trimisă în SmartBill la cerere.',
                },
                manager,
            );
            return manager.findOneOrFail(Payment, { where: { id: payment.id } });
        });
    }

    /**
     * "It is there" — the way out of `REVIEW` when the collection was recorded. A cash payment needs
     * the receipt's number, read by the person in SmartBill: the platform never takes one it did not
     * see. Audited, and refused from any other state.
     */
    async confirmRecorded(paymentId: number, receiptNumber: string | undefined, actor: Actor): Promise<Payment> {
        return this.dataSource.transaction(async (manager) => {
            const payment = await manager.findOne(Payment, { where: { id: paymentId }, lock: { mode: 'pessimistic_write' } });
            if (!payment) throw new NotFoundException('Payment not found');
            if (payment.fiscalStatus !== PaymentFiscalStatus.REVIEW) {
                throw new ConflictException({
                    message: `Payment ${paymentId} is ${payment.fiscalStatus ?? 'not queued for SmartBill'}; only one under review can be confirmed.`,
                    error: 'PAYMENT_FISCAL_NOT_UNDER_REVIEW',
                });
            }

            const cash = payment.method === PaymentMethod.CASH;
            const series = cash ? (smartBillConfig().receiptSeries ?? null) : null;
            if (cash && !receiptNumber) {
                throw new BadRequestException({
                    message: 'A cash payment is recorded in SmartBill as a receipt; its number is needed to confirm it.',
                    error: 'RECEIPT_NUMBER_REQUIRED',
                });
            }

            await manager.update(Payment, payment.id, {
                fiscalStatus: PaymentFiscalStatus.RECORDED,
                fiscalReceiptSeries: series,
                fiscalReceiptNumber: cash ? (receiptNumber ?? null) : null,
                fiscalRecordedAt: new Date(),
                fiscalNextAttemptAt: null,
                fiscalLastError: null,
            });
            await this.audit.record(
                {
                    actor,
                    action: AuditAction.UPDATED,
                    entityType: 'Payment',
                    entityId: payment.id,
                    changes: {
                        fiscalStatus: { from: PaymentFiscalStatus.REVIEW, to: PaymentFiscalStatus.RECORDED },
                        ...(cash ? { fiscalReceiptNumber: { from: null, to: `${series ?? ''} ${receiptNumber ?? ''}`.trim() } } : {}),
                    },
                    note: 'Încasarea confirmată de mână în SmartBill, după un răspuns pierdut.',
                },
                manager,
            );
            return manager.findOneOrFail(Payment, { where: { id: payment.id } });
        });
    }
}

function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function stopReasonFor(error: unknown): PaymentFiscalDrainResult['stoppedBy'] {
    if (error instanceof SmartBillError && error.kind === 'throttled') return 'throttled';
    if (error instanceof SmartBillError && error.kind === 'ambiguous') return 'unanswered';
    return 'configuration';
}

/**
 * What keeps the payments' queue from moving: nothing outside `live`, where payments do not go;
 * in `live`, the credentials, the receipt series and a production backend.
 */
function blockersOf(config: SmartBillConfig): string[] {
    if (config.mode !== 'live') return [];
    const blockers = missingSmartBillSettings(config);
    if (!config.receiptSeries) blockers.push('SMARTBILL_RECEIPT_SERIES');
    if (!mayIssueFiscalDocuments()) blockers.push('NODE_ENV=production');
    return blockers;
}
