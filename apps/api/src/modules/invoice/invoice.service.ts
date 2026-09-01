import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
import { Enrollment } from 'src/entities/enrollment.entity';
import { EnrollmentStatus } from 'src/enum/enrollment-status.enum';
import { GetPreviewDto } from './dto/getPreview.dto';
import { IssueFromSessionsDto } from './dto/issueFromSessions.dto';
// E14 moved `S3Service` out of this module: it is no longer only about invoices, it stores
// children's project files too.
import { ObjectNotFoundError, S3Service } from 'src/modules/storage/s3.service';
import { amountAfterDiscounts, sessionAmountAfterDiscounts } from './pricing';

/** One family's row on the issuing screen, with the children whose sessions have to be counted. */
export interface InvoiceWorksheetRow {
    parentId: number;
    parentName: string;
    email: string | null;
    /** True when this family already has an invoice for the month, so the screen can skip them. */
    alreadyInvoiced: boolean;
    children: {
        childId: number;
        childName: string;
        groupId: number | null;
        groupName: string | null;
        /** ISO weekday of the group, so whoever is counting knows which day to count. */
        weekday: number | null;
    }[];
}

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
    private readonly logger = new Logger('Invoice');

    constructor(
        @InjectRepository(Invoice) private readonly invoiceRepository: Repository<Invoice>,
        @InjectRepository(Profile) private readonly profileRepository: Repository<Profile>,
        @InjectRepository(Discount) private readonly discountRepository: Repository<Discount>,
        @InjectRepository(Enrollment) private readonly enrollmentRepository: Repository<Enrollment>,
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
                await this.s3Service.putObject({ key: fileName, body: pdfBuffer, contentType: 'application/pdf' });

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

        // A waived month has no document by design — nothing to print, nobody to ask for money.
        // Said outright rather than left to the storage lookup missing: "this month has no invoice"
        // is a fact about the month, while "the file is not there" reads as something broken.
        if (invoice.status === InvoiceStatus.WAIVED) {
            throw new NotFoundException('Luna aceasta a fost consemnată fără plată, deci nu are factură');
        }

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

    /**
     * What a family owes for a month.
     *
     * **Counts children with an `ACTIVE` enrolment, not children on file.** Two things follow from
     * that, and the second was a live bug:
     *
     *  - A trial is not billed — E11/S4 says so in as many words. A trial is free; billing it would
     *    make the whole point of offering one collapse on the first invoice.
     *  - A child registered but placed in no group is not billed either. That was already wrong
     *    before trials existed: the price is per child attending, and the family of a child who has
     *    not started yet was being charged for them.
     *
     * If the school ever wants to bill a family whose child is between groups for a month, that is a
     * pricing decision and belongs in E15 — not a quiet count of rows in `children`.
     */
    async calculateAmount(parentId: number, monthIssued: string): Promise<number> {
        const profile = await this.profileRepository.findOne({ where: { id: parentId } });

        if (!profile) throw new NotFoundException('Parent profile not found');

        const billableChildren = await this.enrollmentRepository
            .createQueryBuilder('enrollment')
            .leftJoin('enrollment.child', 'child')
            .where('child.parent_id = :parentId', { parentId })
            .andWhere('enrollment.status = :status', { status: EnrollmentStatus.ACTIVE })
            .getCount();

        if (billableChildren === 0) {
            throw new NotFoundException('Parent has no enrolled children');
        }
        const discounts = await this.discountRepository.find({ where: { parent: { id: profile.id }, monthIssued: monthIssued } });

        // The rule itself lives in `pricing.ts`, with the reasoning. It used to be inline here and,
        // separately, in the seed — where it charged 500 for two children instead of 600 and
        // nothing at all for three.
        return amountAfterDiscounts(billableChildren, discounts);
    }

    /**
     * The worksheet behind the issuing screen — every family, every child, every group, for a month.
     *
     * Deliberately does **not** carry an amount. It carries the rows an admin has to fill in, plus
     * what is already known about each of them, and the arithmetic happens on the screen as they
     * type. Sending a pre-computed total would invite pressing the button without reading it.
     *
     * `alreadyInvoiced` is the field that makes the screen re-runnable, and it will be used: an
     * admin issues on the first, a family enrols on the fifth, and the second run must invoice only
     * them. `@Unique(['parent', 'monthIssued'])` means a blind second pass fails for everybody,
     * including the families that were fine.
     */
    async getWorksheet(monthIssued: string): Promise<InvoiceWorksheetRow[]> {
        const profiles = await this.profileRepository
            .createQueryBuilder('profile')
            .leftJoin('profile.children', 'child')
            .addSelect(['child.id', 'child.firstName', 'child.lastName'])
            .leftJoin('child.group', 'group')
            .addSelect(['group.id', 'group.name', 'group.weekday'])
            .orderBy('profile.lastName', 'ASC')
            .addOrderBy('profile.firstName', 'ASC')
            .addOrderBy('child.firstName', 'ASC')
            .getMany();

        const invoiced = await this.invoiceRepository.find({
            where: { monthIssued },
            relations: { parent: true },
        });
        const invoicedParentIds = new Set(invoiced.map((invoice) => invoice.parent?.id));

        return (
            profiles
                // A family with no child in any group has nothing to count and nothing to owe. They stay
                // off the screen rather than sitting there as a row that must be filled in with zero.
                .filter((profile) => profile.children?.some((child) => child.group))
                .map((profile) => ({
                    parentId: profile.id,
                    parentName: `${profile.lastName} ${profile.firstName}`,
                    email: profile.email ?? null,
                    alreadyInvoiced: invoicedParentIds.has(profile.id),
                    children: (profile.children ?? [])
                        .filter((child) => child.group)
                        .map((child) => ({
                            childId: child.id,
                            childName: `${child.firstName} ${child.lastName}`,
                            groupId: child.group?.id ?? null,
                            groupName: child.group?.name ?? null,
                            weekday: child.group?.weekday ?? null,
                        })),
                }))
        );
    }

    /**
     * Issues a month's invoices from session counts supplied by the caller — E15, the model actually
     * in force.
     *
     * A family whose total comes to zero still gets a **row**, marked `WAIVED`, with no PDF. That is
     * the case where a child could not come at all, or where the school decided not to charge. The
     * record matters more than the document: "October, nothing owed" is settled, while no row at all
     * is a month somebody has to go and check.
     *
     * The only families skipped are those that already have an invoice for the month — which is what
     * lets the screen be run a second time after somebody enrols mid-month.
     */
    async issueFromSessions(dto: IssueFromSessionsDto): Promise<{ issued: Invoice[]; waived: Invoice[]; skipped: { parentId: number; reason: string }[] }> {
        const skipped: { parentId: number; reason: string }[] = [];
        const prepared: { parent: Profile; amount: number }[] = [];

        for (const family of dto.families) {
            const parent = await this.profileRepository.findOne({ where: { id: family.parentId } });
            if (!parent) throw new NotFoundException(`Parent profile ${family.parentId} not found`);

            const existing = await this.invoiceRepository.findOne({
                where: { parent: { id: family.parentId }, monthIssued: dto.monthIssued },
            });
            if (existing) {
                skipped.push({ parentId: family.parentId, reason: 'ALREADY_INVOICED' });
                continue;
            }

            const discounts = await this.discountRepository.find({
                where: { parent: { id: family.parentId }, monthIssued: dto.monthIssued },
            });

            const amount = sessionAmountAfterDiscounts(
                family.children.map((child) => child.sessions),
                discounts,
            );

            prepared.push({ parent, amount });
        }

        const { issued, waived } = await this.dataSource.transaction(async (manager) => {
            const created: Invoice[] = [];
            const nil: Invoice[] = [];

            for (const { parent, amount } of prepared) {
                const invoice = new Invoice();
                invoice.amount = amount;
                invoice.dateIssued = new Date(dto.dateIssued);
                invoice.monthIssued = dto.monthIssued;
                // A month that comes to nothing is recorded, not skipped. The row is the whole
                // point: without it, a family with no October invoice looks the same as a family
                // whose October nobody got round to — and only one of those needs chasing.
                invoice.status = amount > 0 ? InvoiceStatus.PENDING : InvoiceStatus.WAIVED;
                invoice.parent = parent;

                const persisted = await manager.save(invoice);

                if (amount > 0) {
                    const pdfBuffer = await this.pdfService.generateInvoicePdf(persisted);
                    // `putObject`, not `uploadFile`: E14 generalised the client when project files
                    // started going through it, and the content type is no longer assumed to be PDF.
                    await this.s3Service.putObject({
                        key: invoicePdfKey(persisted.monthIssued, persisted.id),
                        body: pdfBuffer,
                        contentType: 'application/pdf',
                    });
                    created.push(persisted);
                } else {
                    // No PDF: there is nothing to print, nobody to ask for money, and an empty
                    // document in the family's file would only ever confuse whoever opened it.
                    nil.push(persisted);
                }
            }

            return { issued: created, waived: nil };
        });

        this.logger.log(`Month ${dto.monthIssued}: issued ${issued.length} invoice(s), waived ${waived.length}, skipped ${skipped.length} already invoiced.`);
        return { issued, waived, skipped };
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
