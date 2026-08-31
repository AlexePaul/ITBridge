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

@Injectable()
export class PaymentService {
    constructor(
        @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
        @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
        @InjectDataSource() private readonly dataSource: DataSource,
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
            const payment = await manager.save(
                Payment,
                manager.create(Payment, {
                    invoice,
                    amount: dto.amount,
                    method: dto.method ?? PaymentMethod.CASH,
                    status: dto.status ?? PaymentStatus.SUCCEEDED,
                    date: new Date(dto.date),
                    externalReference: dto.externalReference ?? null,
                    notes: dto.notes ?? null,
                    recordedBy: recordedByUserId ? ({ id: recordedByUserId } as User) : null,
                }),
            );
            await this.recomputeInvoiceStatus(invoice.id, manager);
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
     */
    async recomputeInvoiceStatus(invoiceId: number, manager: EntityManager): Promise<void> {
        const invoice = await manager.findOne(Invoice, { where: { id: invoiceId } });
        if (!invoice || invoice.status === InvoiceStatus.WAIVED) return;

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
        const payment = await this.paymentRepo.findOne({ where: { id }, relations: { invoice: true } });
        if (!payment) throw new NotFoundException('Payment not found');

        if (dto.amount !== undefined) payment.amount = dto.amount;
        if (dto.method !== undefined) payment.method = dto.method;
        if (dto.status !== undefined) payment.status = dto.status;
        if (dto.date) payment.date = new Date(dto.date);
        if (dto.externalReference !== undefined) payment.externalReference = dto.externalReference;
        if (dto.notes !== undefined) payment.notes = dto.notes;

        // Amount and status both feed the derivation, so any edit rederives.
        return this.dataSource.transaction(async (manager) => {
            const saved = await manager.save(Payment, payment);
            await this.recomputeInvoiceStatus(payment.invoice.id, manager);
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
