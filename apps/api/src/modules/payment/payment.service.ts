import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { Payment, PAYMENT_RECORD_MAY_EXIST, PaymentFiscalStatus } from 'src/entities/payment.entity';
import { Invoice, InvoiceStatus } from 'src/entities/invoice.entity';
import { User } from 'src/entities/user.entity';
import { PaymentMethod } from 'src/enum/payment-method.enum';
import { PaymentStatus } from 'src/enum/payment-status.enum';
import { CreatePaymentDto } from './dto/createPayment.dto';
import { UpdatePaymentDto } from './dto/updatePayment.dto';
import { FilterPaymentDto } from './dto/filterPayment.dto';
import { Role } from 'src/enum/role.enum';
import { AuditService, type Actor } from 'src/modules/audit/audit.service';
import { AuditAction } from 'src/enum/audit-action.enum';
import { snapshotFields } from 'src/modules/audit/audit.rules';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { MailTemplateService } from 'src/modules/mail/mail-template.service';
import { officeAddress } from 'src/modules/mail/office-address';
import { formatLeiRo, romanianDay, romanianMonth } from 'src/modules/invoice/money-words';
import { parseIsoDate, toIsoDate } from 'src/modules/class-session/class-session.dates';
import { smartBillMode } from 'src/modules/smartbill/smartbill.config';
import { paymentsUrl } from 'src/modules/auth/portal-urls';
import { owesReceipt, receiptDedupeKey, receiptTemplate } from './payment-receipt.rules';
import { editTouchesSmartBillRecord, nextPaymentFiscalState, owesSmartBillRecord } from './payment-fiscal.rules';

/** What the invoice looks like once a payment has been counted — the single computation of it. */
export interface InvoiceBalance {
    /** Everything received against the invoice, succeeded rows only. */
    paid: number;
    /** What is left. Floored at zero: an overpayment is not a debt in the other direction. */
    outstanding: number;
    status: InvoiceStatus;
}

/**
 * The fields of a payment worth a line in the audit log — E07 S3.
 *
 * Money, how it arrived, when, and the two free-text fields an admin can put a correction in. Not
 * the invoice or the parent: those are the *subject* of the entry, carried by `entityId` and
 * findable from it, and copying a family's details into every entry would make the log a second
 * store of personal data — which is the opposite of what E07 is for.
 */
const AUDITED_PAYMENT_FIELDS = ['amount', 'method', 'status', 'date', 'externalReference', 'notes'];

function auditableFields(payment: Payment): Record<string, unknown> {
    return {
        amount: payment.amount,
        method: payment.method,
        status: payment.status,
        date: payment.date,
        externalReference: payment.externalReference,
        notes: payment.notes,
    };
}

/**
 * Who recorded the payment — for the office, and for nobody else.
 *
 * Only the id and the name, never the whole row: `User` carries `passwordHash`, and this entity
 * serializes straight onto the wire. And only for an admin: the name is the admin's *login*, the
 * login route is throttled per address rather than per account, and no parent screen shows who
 * took the money — so on a parent's payment it was half of a credential, handed to every family.
 */
function withRecorder(qb: SelectQueryBuilder<Payment>, role: Role): void {
    if (role !== Role.ADMIN) return;
    qb.leftJoin('payment.recordedBy', 'recordedBy').addSelect(['recordedBy.id', 'recordedBy.username']);
}

@Injectable()
export class PaymentService {
    private readonly office = officeAddress();

    constructor(
        @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
        @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly outbox: OutboxService,
        private readonly mailTemplates: MailTemplateService,
        private readonly audit: AuditService,
    ) {}

    /**
     * Records a sum received and rederives the invoice's state from it, in one transaction.
     *
     * The write and the derivation travel together on purpose: a payment saved without the
     * recomputation is exactly the bug the old model had, where `status = PAID` was set by hand next
     * to the row that justified it and nothing kept the two in step afterwards.
     */
    async createPayment(dto: CreatePaymentDto, recordedByUserId: number | undefined, actor: Actor, outer?: EntityManager) {
        const invoice = await this.invoiceRepo.findOne({ where: { id: dto.invoiceId }, relations: { parent: true } });
        if (!invoice) throw new NotFoundException('Invoice not found');

        // A waived month has nothing to pay by definition. Money showing up against one is a sign
        // somebody picked the wrong row, and recording it would quietly turn "we chose not to
        // charge" into "they owed after all".
        if (invoice.status === InvoiceStatus.WAIVED) {
            throw new ConflictException({
                message: 'Factura este anulată (0 lei) — nu se pot înregistra plăți pe ea.',
                error: 'INVOICE_WAIVED',
            });
        }

        // Inside the caller's transaction when it has one — E16/S8: a statement line and the payment
        // it becomes commit together, or neither does.
        const record = async (manager: EntityManager) => {
            const status = dto.status ?? PaymentStatus.SUCCEEDED;
            // E16/S5: money recorded against an invoice SmartBill numbers is owed to SmartBill too,
            // and the queue sends it from here — the admin types it once.
            const fiscalStatus = nextPaymentFiscalState(
                null,
                owesSmartBillRecord({ mode: smartBillMode(), paymentStatus: status, invoiceFiscalStatus: invoice.fiscalStatus }),
            );
            const payment = await manager.save(
                Payment,
                manager.create(Payment, {
                    invoice,
                    amount: dto.amount,
                    method: dto.method ?? PaymentMethod.CASH,
                    status,
                    // From the components, never through UTC: `new Date('2026-03-01')` is midnight UTC,
                    // which is the day before anywhere west of Greenwich.
                    date: parseIsoDate(dto.date.slice(0, 10)),
                    externalReference: dto.externalReference ?? null,
                    notes: dto.notes ?? null,
                    recordedBy: recordedByUserId ? ({ id: recordedByUserId } as User) : null,
                    fiscalStatus,
                    fiscalNextAttemptAt: fiscalStatus === PaymentFiscalStatus.PENDING ? new Date() : null,
                }),
            );
            await this.audit.record(
                {
                    actor,
                    action: AuditAction.CREATED,
                    entityType: 'Payment',
                    entityId: payment.id,
                    changes: snapshotFields(auditableFields(payment), 'created'),
                },
                manager,
            );
            const balance = await this.recomputeInvoiceStatus(invoice.id, manager);
            if (owesReceipt(status)) {
                await this.sendReceipt(invoice, payment, balance, manager);
            }
            return payment;
        };
        return outer ? record(outer) : this.dataSource.transaction(record);
    }

    /**
     * The single writer of the invoice's derived state — E16/S1.
     *
     * Sums the SUCCEEDED payments and compares with the invoice total: covered means PAID, not
     * covered means the invoice goes back to what it was before money entered the picture — OVERDUE
     * stays OVERDUE, because lateness is a fact about the calendar, not about the balance. WAIVED is
     * never touched: it means "nothing to pay", and no payment row should exist against it anyway.
     *
     * Runs inside the caller's transaction so a payment and the state it implies commit together,
     * and **takes the invoice's row lock before it counts**. Two admins recording money against the
     * same invoice in the same second — cash at the desk, a transfer off the statement — each ran
     * this on their own snapshot, so neither saw the other's row: 100 and 250 against a 350 lei
     * invoice both derived "still owing", the invoice stayed `pending`, and each family got a
     * receipt naming a balance they had already cleared. Same shape as the seat count in E11, and
     * the same fix: the lock goes before the number it protects, so the second transaction waits
     * and then counts a total that includes the first. A second take inside one transaction is a
     * no-op, which is why the three writers need nothing of their own.
     *
     * **Returns the balance it computed** — E16/S6. The receipt needs to tell a family what is left,
     * and the sum of succeeded payments is already made here; asking a second time, or subtracting
     * `amount - payments` again in the composer, would be a second definition of "outstanding" free
     * to disagree with the one that just set the invoice's status. Same rule the arrears screen
     * follows, applied one layer down.
     */
    async recomputeInvoiceStatus(invoiceId: number, manager: EntityManager): Promise<InvoiceBalance> {
        const invoice = await manager.findOne(Invoice, { where: { id: invoiceId }, lock: { mode: 'pessimistic_write' } });
        // Nothing to derive, and nothing owed: a waived month is 0 lei by definition.
        if (!invoice) return { paid: 0, outstanding: 0, status: InvoiceStatus.PENDING };
        if (invoice.status === InvoiceStatus.WAIVED) return { paid: 0, outstanding: 0, status: InvoiceStatus.WAIVED };

        const row: { paid: string | null } | undefined = await manager
            .createQueryBuilder(Payment, 'payment')
            .select('SUM(payment.amount)', 'paid')
            .where('payment.invoice_id = :invoiceId', { invoiceId })
            .andWhere('payment.status = :status', { status: PaymentStatus.SUCCEEDED })
            .getRawOne();
        const paid = Number(row?.paid ?? 0);

        const covered = paid >= invoice.amount && invoice.amount > 0;
        const next = covered ? InvoiceStatus.PAID : invoice.status === InvoiceStatus.OVERDUE ? InvoiceStatus.OVERDUE : InvoiceStatus.PENDING;

        if (next !== invoice.status) {
            await manager.update(Invoice, invoiceId, { status: next });
        }

        return { paid, outstanding: Math.max(0, invoice.amount - paid), status: next };
    }

    /**
     * Tells the family the money arrived — E16/S6.
     *
     * The half of S6 that does not wait on SmartBill. The document itself is S2's job and blocked on
     * S0; the confirmation is not, and its absence was the gap: recording a payment changed the
     * invoice, took the family off the arrears list and stopped the reminders, and said **nothing**
     * to the person who had just paid. A family who transfers money and hears back only silence has
     * no way to tell "received" from "lost", and the next thing they hear is the next month's bill.
     *
     * Queued inside the caller's transaction, with the manager passed through: the receipt and the
     * payment that justifies it commit together, or neither does. A receipt for a payment that
     * rolled back is worse than no receipt.
     *
     * `queueOrRecord`, not `queue`: a family with no address leaves an `undeliverable` row rather
     * than being skipped in silence (E17/S5). Not `queueMarketing` either — this is the execution of
     * a contract, and no preference switch may withhold it.
     */
    private async sendReceipt(invoice: Invoice, payment: Payment, balance: InvoiceBalance, manager: EntityManager): Promise<void> {
        const parent = invoice.parent;
        const firstName = parent?.firstName ?? '';

        const mail = await this.mailTemplates.render(receiptTemplate(balance.status), {
            firstName,
            month: romanianMonth(invoice.monthIssued),
            // What arrived now, not the running total: the family recognises the figure they sent.
            amount: formatLeiRo(payment.amount),
            paidOn: romanianDay(toIsoDate(payment.date)),
            outstanding: formatLeiRo(balance.outstanding),
            officeEmail: this.office,
            // The confirmation goes the minute the money is entered; the fiscal documents follow in
            // SmartBill's own time. The portal is where both are, whenever they arrive — E16/S6.
            portalUrl: paymentsUrl(),
        });

        await this.outbox.queueOrRecord(
            { email: parent?.email },
            {
                subject: mail.subject,
                bodyText: mail.bodyText,
                bodyHtml: mail.bodyHtml ?? undefined,
                dedupeKey: receiptDedupeKey(payment.id),
            },
            manager,
        );
    }

    async findPayments(filter: FilterPaymentDto, role: Role, userId: number) {
        const qb = this.paymentRepo.createQueryBuilder('payment').leftJoinAndSelect('payment.invoice', 'invoice').leftJoinAndSelect('invoice.parent', 'parent');
        withRecorder(qb, role);
        if (role !== Role.ADMIN) {
            qb.leftJoin('parent.user', 'user').andWhere('user.id = :userId', { userId });
        }
        if (filter.invoiceId) qb.andWhere('invoice.id = :invoiceId', { invoiceId: filter.invoiceId });
        if (filter.dateFrom) qb.andWhere('payment.date >= :from', { from: filter.dateFrom });
        if (filter.dateTo) qb.andWhere('payment.date <= :to', { to: filter.dateTo });

        return qb.getMany();
    }

    async findOne(id: number, role: Role, userId: number) {
        const qb = this.paymentRepo.createQueryBuilder('payment').leftJoinAndSelect('payment.invoice', 'invoice').leftJoinAndSelect('invoice.parent', 'parent');
        withRecorder(qb, role);

        // `andWhere` throughout, never `where`. A `where()` call *replaces* the whole clause, so the
        // narrowing below used to be wiped out by the id filter that followed it — and every parent
        // could read every other family's payment, joined profile included. Add the id first so no
        // later condition can be the one that resets the builder.
        qb.andWhere('payment.id = :id', { id });
        if (role !== Role.ADMIN) {
            qb.leftJoin('parent.user', 'user').andWhere('user.id = :userId', { userId });
        }

        const payment = await qb.getOne();
        if (!payment) throw new NotFoundException('Payment not found');

        return payment;
    }

    /**
     * Edits a payment and rederives the invoice, in one transaction, under the payment's row lock.
     *
     * **Only the fields sent are written** — never the whole row read beforehand. Since E16/S5 the
     * row also carries the fiscal queue's state, and a whole-entity `save` of a row read before the
     * queue moved it would write the old state back: a payment the queue had just recorded in
     * SmartBill would return to `pending` and be recorded a second time. Same trap `updateInvoice`
     * fell into, and the same fix.
     *
     * A payment whose collection exists in SmartBill, or may, keeps its sum, day and method: SmartBill
     * would hold a record the platform no longer has. Its status stays editable, which is how a
     * transfer that bounced is recorded — see `editTouchesSmartBillRecord`.
     *
     * Inside the caller's transaction when it has one, like `createPayment`: a statement line that
     * confirms an announced transfer and the confirmation commit together (E16/S8).
     */
    async updatePayment(id: number, dto: UpdatePaymentDto, actor: Actor, outer?: EntityManager) {
        const edit = async (manager: EntityManager) => {
            // The lock first, on the payment alone — `FOR UPDATE` cannot sit on the nullable side of
            // the joins the relations below need. The queue claims with `SKIP LOCKED`, so while this
            // holds the row, no pass can take it.
            const locked = await manager.findOne(Payment, { where: { id }, lock: { mode: 'pessimistic_write' } });
            if (!locked) throw new NotFoundException('Payment not found');
            // `invoice.parent` because a payment that becomes succeeded here earns a receipt, and the
            // receipt is addressed to the family — E16/S6.
            const payment = await manager.findOneOrFail(Payment, { where: { id }, relations: { invoice: { parent: true } } });

            const date = dto.date ? dto.date.slice(0, 10) : undefined;
            if (
                editTouchesSmartBillRecord(
                    { fiscalStatus: payment.fiscalStatus, amount: payment.amount, method: payment.method, date: toIsoDate(payment.date) },
                    { amount: dto.amount, method: dto.method, date },
                )
            ) {
                throw new ConflictException({
                    message:
                        'Încasarea e înregistrată în SmartBill: suma, data și metoda nu se mai schimbă aici. Stornează plata și înregistreaz-o din nou, iar în SmartBill șterge încasarea veche.',
                    error: 'PAYMENT_RECORDED_IN_SMARTBILL',
                });
            }

            // Read before the edit: the receipt hinges on the *transition* into succeeded, and the log
            // compares against what the row held.
            const previousStatus = payment.status;
            const before = auditableFields(payment);

            const changes: Partial<Payment> = {};
            if (dto.amount !== undefined) changes.amount = dto.amount;
            if (dto.method !== undefined) changes.method = dto.method;
            if (dto.status !== undefined) changes.status = dto.status;
            if (date) changes.date = parseIsoDate(date);
            if (dto.externalReference !== undefined) changes.externalReference = dto.externalReference;
            if (dto.notes !== undefined) changes.notes = dto.notes;

            // What the payment owes SmartBill after the edit. A refused one that was corrected goes
            // back in the queue; one that stopped being money leaves it before it was ever sent; one
            // already there stays there.
            const owes = owesSmartBillRecord({
                mode: smartBillMode(),
                paymentStatus: changes.status ?? payment.status,
                invoiceFiscalStatus: payment.invoice.fiscalStatus,
            });
            const fiscalStatus = nextPaymentFiscalState(payment.fiscalStatus, owes);
            const requeue = fiscalStatus === PaymentFiscalStatus.PENDING && payment.fiscalStatus !== PaymentFiscalStatus.PENDING;
            if (fiscalStatus !== payment.fiscalStatus || requeue) {
                Object.assign(changes, {
                    fiscalStatus,
                    fiscalNextAttemptAt: fiscalStatus === PaymentFiscalStatus.PENDING ? new Date() : null,
                    fiscalAttempts: 0,
                    fiscalExpectedPaid: null,
                    fiscalExpectedNumber: null,
                    fiscalLastError: null,
                });
            }

            if (Object.keys(changes).length > 0) await manager.update(Payment, id, changes);
            const saved = await manager.findOneOrFail(Payment, { where: { id }, relations: { invoice: { parent: true } } });

            // Amount and status both feed the derivation, so any edit rederives.
            const balance = await this.recomputeInvoiceStatus(saved.invoice.id, manager);
            // A transfer recorded as `initiated` while the statement was provisional becomes real here,
            // and this is the moment the family can honestly be told. An edit to a payment that was
            // already succeeded sends nothing: nothing became true.
            if (owesReceipt(saved.status, previousStatus)) {
                await this.sendReceipt(saved.invoice, saved, balance, manager);
            }
            // Inside the transaction, with the manager: a record of a change that rolled back is a
            // lie, and one lost when the change succeeded is a gap. E07/S3.
            await this.audit.recordUpdate(
                {
                    actor,
                    entityType: 'Payment',
                    entityId: saved.id,
                    before,
                    after: auditableFields(saved),
                    fields: AUDITED_PAYMENT_FIELDS,
                },
                manager,
            );
            return saved;
        };
        return outer ? edit(outer) : this.dataSource.transaction(edit);
    }

    async deletePayment(id: number, actor: Actor) {
        // Deleting money that arrived should be rare — a typo'd row, a duplicate. The invoice's
        // state must follow the remaining payments, in the same transaction as the removal.
        return this.dataSource.transaction(async (manager) => {
            const locked = await manager.findOne(Payment, { where: { id }, lock: { mode: 'pessimistic_write' } });
            if (!locked) throw new NotFoundException('Payment not found');
            const payment = await manager.findOneOrFail(Payment, { where: { id }, relations: { invoice: true } });

            // E16/S5: a collection that exists in SmartBill, or may, is not deleted here — SmartBill
            // would keep a record of money the platform no longer has. It is reversed instead.
            if (payment.fiscalStatus !== null && PAYMENT_RECORD_MAY_EXIST.includes(payment.fiscalStatus)) {
                throw new ConflictException({
                    message: 'Încasarea e înregistrată în SmartBill și nu se șterge de aici. Stornează plata, iar în SmartBill șterge încasarea.',
                    error: 'PAYMENT_RECORDED_IN_SMARTBILL',
                });
            }

            await manager.delete(Payment, id);
            await this.recomputeInvoiceStatus(payment.invoice.id, manager);
            // What the row held is kept, because after the delete there is nothing left to look at:
            // "who removed the 350 lei against invoice 412" has no answer otherwise.
            await this.audit.record(
                {
                    actor,
                    action: AuditAction.DELETED,
                    entityType: 'Payment',
                    entityId: id,
                    changes: snapshotFields(auditableFields(payment), 'deleted'),
                },
                manager,
            );
            return { message: 'Payment deleted' };
        });
    }
}
