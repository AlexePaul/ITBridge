import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payment } from 'src/entities/payment.entity';
import { InvoiceStatus } from 'src/entities/invoice.entity';
import { Invoice } from 'src/entities/invoice.entity';
import { Profile } from 'src/entities/profile.entity';
import { CreatePaymentDto } from './dto/createPayment.dto';
import { UpdatePaymentDto } from './dto/updatePayment.dto';
import { FilterPaymentDto } from './dto/filterPayment.dto';
import { Role } from 'src/enum/role.enum';

@Injectable()
export class PaymentService {
    constructor(
        @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
        @InjectRepository(Invoice) private readonly invoiceRepo: Repository<Invoice>,
        @InjectRepository(Profile) private readonly profileRepo: Repository<Profile>,
    ) {}

    async createPayment(createPaymentDto: CreatePaymentDto) {
        const invoice = await this.invoiceRepo.findOne({ where: { id: createPaymentDto.invoiceId }, relations: ['parent', 'parent.user'] });
        if (!invoice) throw new NotFoundException('Invoice not found');

        const payment = this.paymentRepo.create({
            invoice: invoice as any,
            method: createPaymentDto.method ?? 'cash',
            date: new Date(createPaymentDto.date),
        } as any);

        const saved = await this.paymentRepo.save(payment);
        // mark invoice as paid
        invoice.payment = saved as any;
        invoice.status = InvoiceStatus.PAID;
        await this.invoiceRepo.save(invoice);

        return saved;
    }

    async findPayments(filter: FilterPaymentDto, role: Role, userId: number) {
        const qb = this.paymentRepo.createQueryBuilder('payment').leftJoinAndSelect('payment.invoice', 'invoice').leftJoinAndSelect('invoice.parent', 'parent');
        if (role !== Role.ADMIN) {
            qb.leftJoin('parent.user', 'user').andWhere('user.id = :userId', { userId });
        }
        if (filter.invoiceId) qb.andWhere('invoice.id = :invoiceId', { invoiceId: filter.invoiceId });
        if (filter.dateFrom) qb.andWhere('payment.date >= :from', { from: filter.dateFrom });
        if (filter.dateTo) qb.andWhere('payment.date <= :to', { to: filter.dateTo });

        if (role !== Role.ADMIN) {
            qb.leftJoin('parent.user', 'user').andWhere('user.id = :userId', { userId });
        }

        return qb.getMany();
    }

    async findOne(id: number, role: Role, userId: number) {
        const qb = this.paymentRepo.createQueryBuilder('payment').leftJoinAndSelect('payment.invoice', 'invoice').leftJoinAndSelect('invoice.parent', 'parent');
        if (role !== Role.ADMIN) {
            qb.leftJoin('parent.user', 'user').andWhere('user.id = :userId', { userId });
        }
        const payment = await qb.where('payment.id = :id', { id }).getOne();
        if (!payment) throw new NotFoundException('Payment not found');

        return payment;
    }

    async updatePayment(id: number, dto: UpdatePaymentDto) {
        const payment = await this.paymentRepo.findOne({ where: { id }, relations: ['invoice'] });
        if (!payment) throw new NotFoundException('Payment not found');

        if (dto.method !== undefined) payment.method = dto.method;
        if (dto.date) payment.date = new Date(dto.date);

        return this.paymentRepo.save(payment);
    }

    async deletePayment(id: number) {
        const payment = await this.paymentRepo.findOne({ where: { id }, relations: ['invoice'] });
        if (!payment) throw new NotFoundException('Payment not found');

        // unlink payment from invoice
        if (payment.invoice) {
            payment.invoice.payment = null as any;
            await this.invoiceRepo.save(payment.invoice);
        }

        await this.paymentRepo.delete(id);
        return { message: 'Payment deleted' };
    }
}
