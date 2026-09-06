import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Payment } from 'src/entities/payment.entity';
import { Invoice, InvoiceStatus } from 'src/entities/invoice.entity';
import { User } from 'src/entities/user.entity';
import { PaymentMethod } from 'src/enum/payment-method.enum';
import { PaymentStatus } from 'src/enum/payment-status.enum';
import { CreatePaymentDto } from './dto/createPayment.dto';
import { UpdatePaymentDto } from './dto/updatePayment.dto';
import { FilterPaymentDto } from './dto/filterPayment.dto';
import { Role } from 'src/enum/role.enum';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { MailTemplateService } from 'src/modules/mail/mail-template.service';
import { officeAddress } from 'src/modules/mail/office-address';
import { formatLeiRo, romanianDay, romanianMonth } from 'src/modules/invoice/money-words';
import { toIsoDate } from 'src/modules/class-session/class-session.dates';
import { owesReceipt, receiptDedupeKey, receiptTemplate } from './payment-receipt.rules';

/** What the invoice looks like once a payment has been counted — the single computation of it. */
export interface InvoiceBalance {
    /** Everything received against the invoice, succeeded rows only. */
    paid: number;
    /** What is left. Floored at zero: an overpayment is not a debt in the other direction. */
    outstanding: number;
    status: InvoiceStatus;
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
    ) {}

    /**
     * Records a sum received and rederives the invoice's state from it, in one transaction.
     *
     * The write and the derivation travel together on purpose: a payment saved without the
     * recomputation is exactly the bug the old model had, where `status = PAID` was set by hand next
     * to the row that justified it and nothing kept the two in step afterwards.
     */
    async createPayment(dto: CreatePaymentDto, recordedByUserId?: number) {
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

        return this.dataSource.transaction(async (manager) => {
            const status = dto.status ?? PaymentStatus.SUCCEEDED;
            const payment = await manager.save(
                Payment,
                manager.create(Payment, {
                    invoice,
                    amount: dto.amount,
                    method: dto.method ?? PaymentMethod.CASH,
                    status,
                    date: new Date(dto.date),
                    externalReference: dto.externalReference ?? null,
                    notes: dto.notes ?? null,
                    recordedBy: recordedByUserId ? ({ id: recordedByUserId } as User) : null,
                }),
            );
            const balance = await this.recomputeInvoiceStatus(invoice.id, manager);
            if (owesReceipt(status)) {
                await this.sendReceipt(invoice, payment, balance, manager);
            }
            return payment;
        });
    }

    /**
     * The single writer of the invoice's derived state — E16/S1.
     *
     * Sums the SUCCEEDED payments and compares with the invoice total: covered means PAID, not
     * covered means the invoice goes back to what it was before money entered the picture — OVERDUE
     * stays OVERDUE, because lateness is a fact about the calendar, not about the balance. WAIVED is
     * never touched: it means "nothing to pay", and no payment row should exist against it anyway.
     *
     * Runs inside the caller's transaction so a payment and the state it implies commit together.
     *
     * **Returns the balance it computed** — E16/S6. The receipt needs to tell a family what is left,
     * and the sum of succeeded payments is already made here; asking a second time, or subtracting
     * `amount - payments` again in the composer, would be a second definition of "outstanding" free
     * to disagree with the one that just set the invoice's status. Same rule the arrears screen
     * follows, applied one layer down.
     */
    async recomputeInvoiceStatus(invoiceId: number, manager: EntityManager): Promise<InvoiceBalance> {
        const invoice = await manager.findOne(Invoice, { where: { id: invoiceId } });
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
        const qb = this.paymentRepo
            .createQueryBuilder('payment')
            .leftJoinAndSelect('payment.invoice', 'invoice')
            .leftJoinAndSelect('invoice.parent', 'parent')
            // Only the name, never the whole row: `User` carries `passwordHash`, and this entity
            // serializes straight onto the wire.
            .leftJoin('payment.recordedBy', 'recordedBy')
            .addSelect(['recordedBy.id', 'recordedBy.username']);
        if (role !== Role.ADMIN) {
            qb.leftJoin('parent.user', 'user').andWhere('user.id = :userId', { userId });
        }
        if (filter.invoiceId) qb.andWhere('invoice.id = :invoiceId', { invoiceId: filter.invoiceId });
        if (filter.dateFrom) qb.andWhere('payment.date >= :from', { from: filter.dateFrom });
        if (filter.dateTo) qb.andWhere('payment.date <= :to', { to: filter.dateTo });

        return qb.getMany();
    }

    async findOne(id: number, role: Role, userId: number) {
        const qb = this.paymentRepo
            .createQueryBuilder('payment')
            .leftJoinAndSelect('payment.invoice', 'invoice')
            .leftJoinAndSelect('invoice.parent', 'parent')
            .leftJoin('payment.recordedBy', 'recordedBy')
            .addSelect(['recordedBy.id', 'recordedBy.username']);

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

    async updatePayment(id: number, dto: UpdatePaymentDto) {
        // `invoice.parent` because a payment that becomes succeeded here earns a receipt, and the
        // receipt is addressed to the family — E16/S6.
        const payment = await this.paymentRepo.findOne({ where: { id }, relations: { invoice: { parent: true } } });
        if (!payment) throw new NotFoundException('Payment not found');

        // Read before the edit overwrites it: the receipt hinges on the *transition* into succeeded,
        // and after the assignments below there is nothing left to compare against.
        const previousStatus = payment.status;

        if (dto.amount !== undefined) payment.amount = dto.amount;
        if (dto.method !== undefined) payment.method = dto.method;
        if (dto.status !== undefined) payment.status = dto.status;
        if (dto.date) payment.date = new Date(dto.date);
        if (dto.externalReference !== undefined) payment.externalReference = dto.externalReference;
        if (dto.notes !== undefined) payment.notes = dto.notes;

        // Amount and status both feed the derivation, so any edit rederives.
        return this.dataSource.transaction(async (manager) => {
            const saved = await manager.save(Payment, payment);
            const balance = await this.recomputeInvoiceStatus(payment.invoice.id, manager);
            // A transfer recorded as `initiated` while the statement was provisional becomes real here,
            // and this is the moment the family can honestly be told. An edit to a payment that was
            // already succeeded sends nothing: nothing became true.
            if (owesReceipt(saved.status, previousStatus)) {
                await this.sendReceipt(payment.invoice, saved, balance, manager);
            }
            return saved;
        });
    }

    async deletePayment(id: number) {
        const payment = await this.paymentRepo.findOne({ where: { id }, relations: { invoice: true } });
        if (!payment) throw new NotFoundException('Payment not found');

        // Deleting money that arrived should be rare — a typo'd row, a duplicate. The invoice's
        // state must follow the remaining payments, in the same transaction as the removal.
        return this.dataSource.transaction(async (manager) => {
            await manager.delete(Payment, id);
            await this.recomputeInvoiceStatus(payment.invoice.id, manager);
            return { message: 'Payment deleted' };
        });
    }
}
