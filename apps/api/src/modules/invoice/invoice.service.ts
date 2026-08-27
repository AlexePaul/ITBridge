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
import { ObjectNotFoundError, S3Service } from './s3.service';

/**
 * Where an invoice's PDF lives in object storage.
 *
 * Keyed on the invoice id alone, never on the parent's name. The name used to be part of the key,
 * and it was rebuilt from the *current* profile at download time — so renaming a parent (a
 * marriage, a corrected typo) silently made every invoice they had ever received unreachable, with
 * the object still sitting in the bucket under the old spelling. Verified before the change: a
 * PUT on the profile turned a working download into a 500, permanently.
 */
export function invoicePdfKey(monthIssued: string, invoiceId: number): string {
    return `invoices/${monthIssued}/${invoiceId}.pdf`;
}

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
     * The whole batch is one transaction. Ordering matters: the file name embeds the invoice id, so
     * each row has to exist before its upload — but if an upload then fails, no row may survive.
     * Without this, a failed upload left a persisted invoice with no PDF, the caller saw a 500 and
     * retried, and the retry hit `@Unique(['parent', 'monthIssued'])`, wedging invoicing for that
     * parent and month until somebody deleted the row by hand.
     *
     * The transaction spans every parent rather than each one separately, so a failure on the third
     * parent does not leave the first two committed with the caller told only that the request
     * failed — which would move the same wedge from the single invoice to the batch.
     *
     * Uploads happen while the transaction is open, holding it across network calls. At this scale
     * that is the right trade: a slow issue beats a half-written one.
     */
    async createInvoice(createInvoiceDto: CreateInvoiceDto) {
        // Resolved before the transaction opens: a missing parent should fail the request without
        // having held a transaction across an S3 round trip first.
        const parents = await Promise.all(
            createInvoiceDto.parentIds.map(async (parentId) => {
                const parent = await this.profileRepository.findOne({ where: { id: parentId } });
                if (!parent) throw new NotFoundException('Parent profile not found');
                return { parent, amount: await this.calculateAmount(parentId, createInvoiceDto.monthIssued) };
            }),
        );

        return this.dataSource.transaction(async (manager) => {
            const invoicesCreated: Invoice[] = [];

            for (const { parent, amount } of parents) {
                const invoice = new Invoice();
                invoice.amount = amount;
                invoice.dateIssued = new Date(createInvoiceDto.dateIssued);
                invoice.monthIssued = createInvoiceDto.monthIssued;
                invoice.status = InvoiceStatus.PENDING;
                invoice.parent = parent;

                const persisted = await manager.save(invoice);

                const pdfBuffer = await this.pdfService.generateInvoicePdf(persisted);
                const fileName = invoicePdfKey(persisted.monthIssued, persisted.id);
                await this.s3Service.uploadFile(pdfBuffer, fileName);

                invoicesCreated.push(persisted);
            }

            return invoicesCreated;
        });
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

        try {
            return await this.s3Service.downloadFile(invoicePdfKey(invoice.monthIssued, invoice.id));
        } catch (error: unknown) {
            // A stored invoice whose PDF is missing is a 404 with a message that says so, not a
            // 500 claiming the server broke. It happens for every invoice written straight to the
            // database rather than issued through this service — every row `pnpm seed` creates,
            // for one, which made the download button on the admin invoice screen fail on a
            // freshly seeded database.
            if (error instanceof ObjectNotFoundError) {
                throw new NotFoundException('The PDF for this invoice has not been generated');
            }
            throw error;
        }
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
                    .then((amount) => ({ parentId, amount, error: null as string | null }))
                    // Only the expected case is absorbed - a parent with no children, or no such
                    // parent, is a row the preview reports on rather than a reason to fail the
                    // whole call. Anything else used to vanish here too, so an admin previewing
                    // ten parents silently got seven rows and no hint that three had failed.
                    .catch((error: unknown) => {
                        if (error instanceof NotFoundException) {
                            return { parentId, amount: null, error: error.message };
                        }
                        throw error;
                    }),
            ),
        );
        return results;
    }
}
