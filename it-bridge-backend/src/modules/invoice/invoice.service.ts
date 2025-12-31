import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice } from 'src/entities/invoice.entity';
import { Profile } from 'src/entities/profile.entity';
import { Payment } from 'src/entities/payment.entity';
import { CreateInvoiceDto } from './dto/createInvoice.dto';
import { UpdateInvoiceDto } from './dto/updateInvoice.dto';
import { FilterInvoiceDto } from './dto/filterInvoice.dto';
import { Role } from 'src/enum/role.enum';

@Injectable()
export class InvoiceService {
    constructor(
        @InjectRepository(Invoice) private readonly invoiceRepository: Repository<Invoice>,
        @InjectRepository(Profile) private readonly profileRepository: Repository<Profile>,
        @InjectRepository(Payment) private readonly paymentRepository: Repository<Payment>,
    ) {}

    async createInvoice(createInvoiceDto: CreateInvoiceDto) {
        const parent = await this.profileRepository.findOne({ where: { id: createInvoiceDto.parentId } });
        if (!parent) throw new NotFoundException('Parent profile not found');

        const invoice = this.invoiceRepository.create({
            amount: createInvoiceDto.amount,
            dateIssued: new Date(createInvoiceDto.dateIssued),
            status: createInvoiceDto.status ?? 'PENDING',
            parent,
        } as any);

        return this.invoiceRepository.save(invoice);
    }

    async findInvoices(filterInvoiceDto: FilterInvoiceDto, role: Role, userId: number) {
        const qb = this.invoiceRepository.createQueryBuilder('invoice').leftJoinAndSelect('invoice.parent', 'parent');
        if (role !== Role.ADMIN) {
            qb.leftJoin('parent.user', 'user').andWhere('user.id = :userId', { userId });
        }
        if (filterInvoiceDto.parentId) qb.andWhere('parent.id = :parentId', { parentId: filterInvoiceDto.parentId });
        if (filterInvoiceDto.status) qb.andWhere('invoice.status = :status', { status: filterInvoiceDto.status });
        if (filterInvoiceDto.dateFrom) qb.andWhere('invoice.dateIssued >= :from', { from: filterInvoiceDto.dateFrom });
        if (filterInvoiceDto.dateTo) qb.andWhere('invoice.dateIssued <= :to', { to: filterInvoiceDto.dateTo });

        return qb.getMany();
    }

    async findOne(id: number, role: Role, userId: number) {
        const qb = this.invoiceRepository.createQueryBuilder('invoice').leftJoinAndSelect('invoice.parent', 'parent');
        if (role !== Role.ADMIN) {
            qb.leftJoin('parent.user', 'user').andWhere('user.id = :userId', { userId });
        }
        qb.andWhere('invoice.id = :id', { id });

        const invoice = await qb.getOne();
        if (!invoice) throw new NotFoundException('Invoice not found');
        return invoice;
    }

    async updateInvoice(id: number, dto: UpdateInvoiceDto) {
        const invoice = await this.invoiceRepository.findOne({ where: { id }, relations: ['parent', 'parent.user'] });

        if (!invoice) throw new NotFoundException('Invoice not found');

        if (dto.amount) invoice.amount = dto.amount;
        if (dto.dateIssued) invoice.dateIssued = new Date(dto.dateIssued);
        if (dto.status) invoice.status = dto.status;

        return this.invoiceRepository.save(invoice);
    }

    async deleteInvoice(id: number) {
        const invoice = await this.invoiceRepository.findOne({ where: { id }, relations: ['parent', 'parent.user'] });

        if (!invoice) throw new NotFoundException('Invoice not found');

        await this.invoiceRepository.delete(id);
    }
}
