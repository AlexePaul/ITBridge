import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Invoice, InvoiceStatus } from 'src/entities/invoice.entity';
import { Profile } from 'src/entities/profile.entity';
import { CreateInvoiceDto } from './dto/createInvoice.dto';
import { UpdateInvoiceDto } from './dto/updateInvoice.dto';
import { FilterInvoiceDto } from './dto/filterInvoice.dto';
import { Role } from 'src/enum/role.enum';
import { PdfService } from './pdf.service';
import { Discount } from 'src/entities/discount.entity';
import { GetPreviewDto } from './dto/getPreview.dto';
import { S3Service } from './s3.service';

@Injectable()
export class InvoiceService {
    constructor(
        @InjectRepository(Invoice) private readonly invoiceRepository: Repository<Invoice>,
        @InjectRepository(Profile) private readonly profileRepository: Repository<Profile>,
        @InjectRepository(Discount) private readonly discountRepository: Repository<Discount>,
        private readonly pdfService: PdfService,
        private readonly s3Service: S3Service,
        private readonly dataSource: DataSource,
    ) {}

    /**
     * Issues one invoice per parent.
     *
     * Each invoice is written and its PDF uploaded inside a single transaction. That ordering
     * matters: the file name embeds the invoice id, so the row has to exist before the upload — but
     * if the upload then fails, the row must not survive. Without the transaction a failed upload
     * left a persisted invoice with no PDF, the caller saw a 500 and retried, and the retry hit
     * `@Unique(['parent', 'monthIssued'])` — so one S3 hiccup wedged invoicing for that parent and
     * month until somebody deleted the row by hand.
     *
     * The upload happens while the transaction is open, which holds it across a network call. At
     * this scale that is the right trade: a slow issue beats a half-written one.
     */
    async createInvoice(createInvoiceDto: CreateInvoiceDto) {
        const invoicesCreated: Invoice[] = [];

        for (const parentId of createInvoiceDto.parentIds) {
            const parent = await this.profileRepository.findOne({ where: { id: parentId } });
            if (!parent) throw new NotFoundException('Parent profile not found');

            const amount = await this.calculateAmount(parentId, createInvoiceDto.monthIssued);

            const saved = await this.dataSource.transaction(async (manager) => {
                const invoice = new Invoice();
                invoice.amount = amount;
                invoice.dateIssued = new Date(createInvoiceDto.dateIssued);
                invoice.monthIssued = createInvoiceDto.monthIssued;
                invoice.status = InvoiceStatus.PENDING;
                invoice.parent = parent;

                const persisted = await manager.save(invoice);

                const pdfBuffer = await this.pdfService.generateInvoicePdf(persisted);
                const fileName = `invoices/${persisted.monthIssued}/${persisted.id}_${parent.firstName}_${parent.lastName}.pdf`;
                await this.s3Service.uploadFile(pdfBuffer, fileName);

                return persisted;
            });

            invoicesCreated.push(saved);
        }

        return invoicesCreated;
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
        const fileName = `invoices/${invoice.monthIssued}/${invoice.id + '_' + invoice.parent.firstName + '_' + invoice.parent.lastName}.pdf`;
        return this.s3Service.downloadFile(fileName);
    }

    async calculateAmount(parentId: number, monthIssued: string): Promise<number> {
        const profile = await this.profileRepository.findOne({ where: { id: parentId }, relations: ['children'] });

        if (!profile) throw new NotFoundException('Parent profile not found');

        if (profile.children.length === 0) {
            throw new NotFoundException('Parent has no children');
        }
        let totalAmount = 0;
        if (profile.children.length === 1) totalAmount = 350;
        else if (profile.children.length === 2) totalAmount = 250 * profile.children.length;

        const discounts = await this.discountRepository.find({ where: { parent: { id: profile.id }, monthIssued: monthIssued } });
        for (const discount of discounts) {
            totalAmount -= discount.value;
        }

        return totalAmount;
    }

    async getPreview(dto: GetPreviewDto) {
        const results = await Promise.all(
            dto.parentIds.map(async (parentId) =>
                this.calculateAmount(parentId, dto.monthIssued)
                    .then((amount) => ({
                        parentId,
                        amount,
                    }))
                    .catch(() => null),
            ),
        );
        return results.filter((res) => res !== null);
    }
}
