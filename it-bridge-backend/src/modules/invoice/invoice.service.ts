import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Invoice, InvoiceStatus } from 'src/entities/invoice.entity';
import { Profile } from 'src/entities/profile.entity';
import { Payment } from 'src/entities/payment.entity';
import { CreateInvoiceDto } from './dto/createInvoice.dto';
import { UpdateInvoiceDto } from './dto/updateInvoice.dto';
import { FilterInvoiceDto } from './dto/filterInvoice.dto';
import { Role } from 'src/enum/role.enum';
import { PdfService } from './pdf.service';
import { Discount } from 'src/entities/discount.entity';

@Injectable()
export class InvoiceService {
    constructor(
        @InjectRepository(Invoice) private readonly invoiceRepository: Repository<Invoice>,
        @InjectRepository(Profile) private readonly profileRepository: Repository<Profile>,
        @InjectRepository(Discount) private readonly discountRepository: Repository<Discount>,
        private readonly pdfService: PdfService,
    ) {}

    async createInvoice(createInvoiceDto: CreateInvoiceDto) {
        const parent = await this.profileRepository.findOne({ where: { id: createInvoiceDto.parentId } });
        if (!parent) throw new NotFoundException('Parent profile not found');

        const invoice = new Invoice();
        invoice.amount = await this.calculateAmount(createInvoiceDto);
        invoice.dateIssued = new Date(createInvoiceDto.dateIssued);
        invoice.monthIssued = createInvoiceDto.monthIssued;
        invoice.status = createInvoiceDto.status ?? InvoiceStatus.PENDING;
        invoice.parent = parent;
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

    async getInvoicePdf(id: number, role: Role, userId: number) {
        const invoice = await this.findOne(id, role, userId);
        return this.pdfService.generateInvoicePdf(invoice);
    }

    async calculateAmount(createInvoiceDto: CreateInvoiceDto): Promise<number> {
        const profile = await this.profileRepository.findOne({ where: { id: createInvoiceDto.parentId }, relations: ['children'] });

        if (!profile) throw new NotFoundException('Parent profile not found');

        if (profile.children.length === 0) {
            throw new NotFoundException('Parent has no children');
        }
        let totalAmount = 0;
        if (profile.children.length === 1) totalAmount = 350;
        else if (profile.children.length === 2) totalAmount = 250 * profile.children.length;

        const discounts = await this.discountRepository.find({ where: { parent: { id: profile.id }, monthIssued: createInvoiceDto.monthIssued } });
        for (const discount of discounts) {
            totalAmount -= discount.value;
        }

        return totalAmount;
    }
}
