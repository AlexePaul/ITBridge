import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { FISCAL_DOCUMENT_MAY_EXIST, Invoice, InvoiceFiscalStatus, InvoiceStatus } from 'src/entities/invoice.entity';
import { Profile } from 'src/entities/profile.entity';
import { Child } from 'src/entities/child.entity';
import { SessionCountOverride } from 'src/entities/session-count-override.entity';
import { SessionCountOverrideDto } from './dto/sessionCountOverride.dto';
import { User } from 'src/entities/user.entity';
import { CreateInvoiceDto } from './dto/createInvoice.dto';
import { UpdateInvoiceDto } from './dto/updateInvoice.dto';
import { FilterInvoiceDto } from './dto/filterInvoice.dto';
import { Role } from 'src/enum/role.enum';
import { DiscountType } from 'src/enum/discount-type.enum';
import { PdfService } from './pdf.service';
import { Discount } from 'src/entities/discount.entity';
import { Enrollment } from 'src/entities/enrollment.entity';
import { EnrollmentStatus } from 'src/enum/enrollment-status.enum';
import { GetPreviewDto } from './dto/getPreview.dto';
import { IssueMonthDto } from './dto/issueMonth.dto';
import { BillableSessionsService, UnmarkedSession } from './billable-sessions.service';
import { BillableLine } from './billable-sessions.rules';
// E14 moved `S3Service` out of this module: it is no longer only about invoices, it stores
// children's project files too.
import { ObjectNotFoundError, S3Service } from 'src/modules/storage/s3.service';
import { amountAfterDiscounts, amountForSessions, discountTotal, sessionAmountAfterDiscounts } from './pricing';
import { AuditService, type Actor } from 'src/modules/audit/audit.service';
import { snapshotFields } from 'src/modules/audit/audit.rules';
import { AuditAction } from 'src/enum/audit-action.enum';
import { invoicePdfKey } from './invoice-pdf-key';
import { FiscalIssuingService } from './fiscal-issuing.service';
import { fiscalStateAtIssue, servesLocalPdf } from './fiscal-issuing.rules';
import { smartBillMode } from 'src/modules/smartbill/smartbill.config';
import { Payment } from 'src/entities/payment.entity';
import { PaymentStatus } from 'src/enum/payment-status.enum';
import { PaymentService } from 'src/modules/payment/payment.service';
import { parseIsoDate } from 'src/modules/class-session/class-session.dates';
import { lockInvoiceMonth } from './invoice-month-lock';
import { schoolDay } from 'src/common/school-clock';
import { monthIsTaught, teachingMonthRange } from './billing-period.rules';
import { issuingNow } from './issuing-clock';

/** One family's row on the issuing screen, with the children whose sessions have to be counted. */
export interface InvoiceWorksheetRow {
    parentId: number;
    parentName: string;
    email: string | null;
    alreadyInvoiced: boolean;
    /** What the family's invoice for the month says, when there is one — `amount` is what the registers come to now. */
    invoicedAmount: number | null;
    /** What the family will be billed after the month's discounts — read, so the screen shows what the server will write. */
    amount: number;
    /** The sessions' price before the discounts: what the child lines on the card add up to. */
    listAmount: number;
    /**
     * The month's discounts and what each takes off `listAmount` (QA of 26 September 2026). The card
     * showed `amount` above lines adding up to the list price, and the difference nowhere.
     */
    discounts: WorksheetDiscount[];
    children: {
        childId: number;
        childName: string;
        groupId: number | null;
        groupName: string | null;
        weekday: number | null;
        /** The number that reaches the price: the count, unless somebody decided otherwise below. */
        sessions: number;
        /** What the registers say, always — shown next to `sessions` when the two differ. */
        counted: number;
        /** The decision on file for this child and month, if any. `sessions` is its number when set. */
        override: { sessions: number; reason: string | null } | null;
        /** Every held session of the child's group in the month, and whether it counted for them. */
        lines: BillableLine[];
    }[];
}

/** A discount on the worksheet, with what it takes off the list price, rounded as `discountTotal` rounds. */
export interface WorksheetDiscount {
    id: number;
    name: string;
    type: DiscountType;
    value: number;
    off: number;
}

/** The whole issuing screen in one payload — E15/S9. */
export interface InvoiceWorksheet {
    month: string;
    /** First and last day the teaching month covers, both inclusive. */
    from: string;
    to: string;
    /** Whether `issueFromSessions` would take the month today (E15 S9). */
    issuable: boolean;
    /** The month's sessions with no register: the money not being asked for. Shown first. */
    unmarked: UnmarkedSession[];
    families: InvoiceWorksheetRow[];
}

// Re-exported: the seed and older callers import it from here.
export { invoicePdfKey };

@Injectable()
export class InvoiceService {
    private readonly logger = new Logger('Invoice');

    constructor(
        @InjectRepository(Invoice) private readonly invoiceRepository: Repository<Invoice>,
        @InjectRepository(Profile) private readonly profileRepository: Repository<Profile>,
        @InjectRepository(Discount) private readonly discountRepository: Repository<Discount>,
        @InjectRepository(Enrollment) private readonly enrollmentRepository: Repository<Enrollment>,
        @InjectRepository(Child) private readonly childRepository: Repository<Child>,
        @InjectRepository(SessionCountOverride) private readonly overrideRepository: Repository<SessionCountOverride>,
        private readonly pdfService: PdfService,
        private readonly s3Service: S3Service,
        private readonly billable: BillableSessionsService,
        private readonly dataSource: DataSource,
        private readonly audit: AuditService,
        private readonly fiscal: FiscalIssuingService,
        private readonly payments: PaymentService,
    ) {}

    /**
     * The fields of an invoice worth a line in the trail — E07/S3.
     *
     * `amount`, because "cine a schimbat suma facturii 412" is the story's own question; the date
     * and the status because both change what the family is asked for and when. Not the parent:
     * that is who the entry is *about*, reachable from `entityId`, and copying a family's details
     * into every entry would make the log a second store of personal data.
     */
    private static readonly AUDITED_INVOICE_FIELDS = ['amount', 'dateIssued', 'status', 'monthIssued'];

    private static auditableInvoice(invoice: Invoice): Record<string, unknown> {
        return {
            amount: invoice.amount,
            dateIssued: invoice.dateIssued,
            status: invoice.status,
            monthIssued: invoice.monthIssued,
        };
    }

    /**
     * Issues one invoice per parent.
     *
     * The whole batch is one transaction, so a failure on the third parent does not leave the first
     * two committed with the caller told only that the request failed — and a retry would then hit
     * `@Unique(['parent', 'monthIssued'])` on the rows that did survive.
     *
     * **No PDF is drawn here** — E15/S6. It used to be, one per parent, uploaded while the transaction
     * was open: a hundred families held it for eight seconds, and a storage outage failed the month.
     * The document is drawn from the row on its first download (`getInvoicePdf`), so issuing is
     * database work only and storage has no say in whether a month exists.
     */
    async createInvoice(createInvoiceDto: CreateInvoiceDto, actor: Actor) {
        // Resolved before the transaction opens: a missing parent should fail the request without
        // having held a transaction across an S3 round trip first.
        const parents = await Promise.all(
            createInvoiceDto.parentIds.map(async (parentId) => {
                const parent = await this.profileRepository.findOne({ where: { id: parentId } });
                if (!parent) throw new NotFoundException('Parent profile not found');
                return { parent, amount: await this.calculateAmount(parentId, createInvoiceDto.monthIssued) };
            }),
        );

        // Read once for the whole batch: a month is issued under one mode, not half and half.
        const mode = smartBillMode();
        const now = new Date();

        return this.dataSource.transaction(async (manager) => {
            const invoicesCreated: Invoice[] = [];

            for (const { parent, amount } of parents) {
                const invoice = new Invoice();
                invoice.amount = amount;
                invoice.dateIssued = parseIsoDate(createInvoiceDto.dateIssued.slice(0, 10));
                invoice.monthIssued = createInvoiceDto.monthIssued;
                invoice.status = InvoiceStatus.PENDING;
                invoice.parent = parent;
                Object.assign(invoice, fiscalStateAtIssue(amount, mode, now));

                const persisted = await manager.save(invoice);

                await this.recordInvoice(persisted, AuditAction.CREATED, actor, manager);

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
        if (filterInvoiceDto.monthIssued) qb.andWhere('invoice.monthIssued = :monthIssued', { monthIssued: filterInvoiceDto.monthIssued });

        return qb.getMany();
    }

    /**
     * The billing months that have invoices, oldest first — what the invoices overview needs to
     * know which range to ask the finance report about. It used to download every invoice to find
     * that out: 6.9 MB at three years, for two strings (review of 26 September 2026).
     */
    async issuedMonths(): Promise<string[]> {
        const rows = await this.invoiceRepository
            .createQueryBuilder('invoice')
            .select('DISTINCT invoice.monthIssued', 'month')
            .orderBy('month', 'ASC')
            .getRawMany<{ month: string }>();
        return rows.map((row) => row.month);
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

    /**
     * Corrects an invoice's amount or date — the platform's record, while no fiscal document holds them.
     *
     * **The status is not an input** — the review of 25 September 2026. It is derived: `paid` from
     * the succeeded payments (`PaymentService.recomputeInvoiceStatus`), `waived` from a zero amount,
     * `overdue` from the calendar. Typed by hand it was a second answer to "has this family paid" —
     * `paid` on the portal beside a debt on the arrears screen, which counts the payments — and an
     * edit of the amount left the derived one stale: 350 lowered to the 200 already paid stayed
     * `pending` for ever. So an amount edit re-derives it, in the same transaction:
     *
     *  - to zero, the month is `waived` and leaves the fiscal queue, as a zero month does at issue —
     *    refused while money sits on the invoice (`INVOICE_HAS_PAYMENTS`): a month the school does
     *    not charge for, with a payment against it, is two facts contradicting each other;
     *  - from zero, it is owed again, and enters the fiscal queue as an issue would;
     *  - otherwise the payments decide, as they do everywhere else.
     */
    async updateInvoice(id: number, dto: UpdateInvoiceDto, actor: Actor) {
        const invoice = await this.invoiceRepository.findOne({ where: { id }, relations: ['parent', 'parent.user'] });

        if (!invoice) throw new NotFoundException('Invoice not found');

        // Read before the assignments below overwrite it — after them there is nothing left to
        // compare against and every diff would be empty.
        const before = InvoiceService.auditableInvoice(invoice);

        const changes: Partial<Pick<Invoice, 'amount' | 'dateIssued'>> = {};
        // Not truthiness: zero is the one amount with a meaning of its own, and `if (dto.amount)`
        // dropped it without a word — the request answered 200 and the invoice kept its 350.
        if (dto.amount !== undefined) changes.amount = dto.amount;
        if (dto.dateIssued) changes.dateIssued = parseIsoDate(dto.dateIssued.slice(0, 10));
        Object.assign(invoice, changes);

        // The save and its record in one transaction: a trail entry that survives a rolled-back
        // edit says something happened that did not — E07/S3.
        const updated = await this.dataSource.transaction(async (manager) => {
            if (Object.keys(changes).length === 0) return invoice;

            // The amount and the date are printed on the fiscal document; once one exists in
            // SmartBill, or may, changing them here would leave the platform's row describing an
            // invoice nobody issued.
            const locked = await this.assertNoFiscalDocument(id, manager, 'change the amount or the date of');

            const derived: Partial<Pick<Invoice, 'status' | 'fiscalStatus' | 'fiscalNextAttemptAt'>> = {};
            if (changes.amount === 0) {
                if (await this.holdsPayments(id, manager, [PaymentStatus.SUCCEEDED, PaymentStatus.INITIATED])) {
                    throw new ConflictException({
                        message: `Invoice ${id} has money recorded against it; a month without charge cannot hold payments — reverse or delete them first.`,
                        error: 'INVOICE_HAS_PAYMENTS',
                    });
                }
                Object.assign(derived, { status: InvoiceStatus.WAIVED }, fiscalStateAtIssue(0, smartBillMode(), new Date()));
            } else if (changes.amount !== undefined && locked?.status === InvoiceStatus.WAIVED) {
                Object.assign(derived, { status: InvoiceStatus.PENDING }, fiscalStateAtIssue(changes.amount, smartBillMode(), new Date()));
            }

            // Only the fields that were sent, and what follows from them. A whole-entity `save` of a
            // row read before this transaction writes back every column that differs from the
            // database — the fiscal ones included — so an invoice the queue had issued in between
            // would be put back in the queue as it was when read, and issued a second time (E16/S2).
            await manager.update(Invoice, id, { ...changes, ...derived });
            // After the write, so the payments are weighed against the new amount. A waived month
            // has nothing to weigh, and the derivation says so itself.
            const balance = changes.amount !== undefined ? await this.payments.recomputeInvoiceStatus(id, manager) : null;

            // Recorded before the derived status reaches `invoice`, so the entry holds the amount and
            // the date and not the status: it moved because the amount did, and a derivation beside
            // the decision that caused it is noise (E07/S3).
            await this.audit.recordUpdate(
                {
                    actor,
                    entityType: 'Invoice',
                    entityId: invoice.id,
                    before,
                    after: InvoiceService.auditableInvoice(invoice),
                    fields: InvoiceService.AUDITED_INVOICE_FIELDS,
                },
                manager,
            );
            if (balance) invoice.status = balance.status;
            if (derived.fiscalStatus !== undefined)
                Object.assign(invoice, { fiscalStatus: derived.fiscalStatus, fiscalNextAttemptAt: derived.fiscalNextAttemptAt });
            return invoice;
        });

        // The amount and the date are printed on the platform's PDF, so a kept drawing of the old
        // ones would go on telling the family what the row no longer says. The next download draws
        // the current row. Only the platform's document: a fiscal one refused the edit above.
        if (changes.amount !== undefined || changes.dateIssued !== undefined) {
            await this.forgetLocalPdf(updated);
        }
        return updated;
    }

    async deleteInvoice(id: number, actor: Actor) {
        const invoice = await this.invoiceRepository.findOne({ where: { id }, relations: ['parent', 'parent.user'] });

        if (!invoice) throw new NotFoundException('Invoice not found');

        // What the row held is kept, because after the delete there is nothing left to look at:
        // "who removed the family's March invoice" has no answer otherwise.
        await this.dataSource.transaction(async (manager) => {
            await this.assertNoFiscalDocument(id, manager, 'delete');
            // `payments.invoice_id` cascades, so the delete took the money with it — every payment,
            // its receipt's reason and its SmartBill record's anchor, with no entry saying any of
            // them had existed. The review of 25 September 2026. Any status counts: a failed or a
            // reversed payment is still the answer to "what happened to the transfer we made".
            if (await this.holdsPayments(id, manager)) {
                throw new ConflictException({
                    message: `Invoice ${id} has payments recorded against it; deleting it would erase them — delete them first, one by one.`,
                    error: 'INVOICE_HAS_PAYMENTS',
                });
            }
            await manager.delete(Invoice, id);
            await this.recordInvoice(invoice, AuditAction.DELETED, actor, manager);
        });
        // The drawing goes with its row: left behind, it would be a document for an invoice that no
        // longer exists, which nothing would ever read or clear.
        await this.forgetLocalPdf(invoice);
    }

    /** Whether any payment — or any in `statuses` — is recorded against the invoice. */
    private async holdsPayments(invoiceId: number, manager: EntityManager, statuses?: PaymentStatus[]): Promise<boolean> {
        const count = await manager.count(Payment, {
            where: { invoice: { id: invoiceId }, ...(statuses ? { status: In(statuses) } : {}) },
        });
        return count > 0;
    }

    /**
     * Refuses to touch an invoice whose fiscal document exists in SmartBill, or may — E16/S2.
     *
     * Under the row lock, because the fiscal queue claims rows with `FOR UPDATE SKIP LOCKED`: holding
     * it here means the queue cannot start sending this invoice halfway through the edit, and an
     * invoice it already started on is seen in the air and refused. The way to correct an issued
     * invoice is a storno in SmartBill; a draft is not a fiscal document and does not block anything.
     */
    private async assertNoFiscalDocument(id: number, manager: EntityManager, act: string): Promise<Invoice | null> {
        const locked = await manager.findOne(Invoice, { where: { id }, lock: { mode: 'pessimistic_write' } });
        if (locked?.fiscalStatus && FISCAL_DOCUMENT_MAY_EXIST.includes(locked.fiscalStatus)) {
            throw new ConflictException({
                message: `Invoice ${id} has a fiscal document in SmartBill (${locked.fiscalStatus}); cannot ${act} it here — issue a storno in SmartBill instead.`,
                error: 'INVOICE_HAS_FISCAL_DOCUMENT',
            });
        }
        return locked;
    }

    /**
     * One row of the trail for an invoice that appeared or went away.
     *
     * Only the two one-sided acts go through here; an edit is `recordUpdate`, which keeps just the
     * fields that moved. `recomputeInvoiceStatus` in `PaymentService` is deliberately *not* audited:
     * it derives a status from the payments that exist, and a log where every derivation sits beside
     * the human decisions is a log in which the decisions cannot be found.
     */
    private async recordInvoice(invoice: Invoice, action: AuditAction, actor: Actor, manager: EntityManager): Promise<void> {
        await this.audit.record(
            {
                actor,
                action,
                entityType: 'Invoice',
                entityId: invoice.id,
                changes: snapshotFields(InvoiceService.auditableInvoice(invoice), action === AuditAction.CREATED ? 'created' : 'deleted'),
            },
            manager,
        );
    }

    async getInvoicePdf(id: number, role: Role, userId: number) {
        const invoice = await this.findOne(id, role, userId);

        // A waived month has no document by design — nothing to print, nobody to ask for money.
        // Said outright rather than left to the storage lookup missing: "this month has no invoice"
        // is a fact about the month, while "the file is not there" reads as something broken.
        // Its own code, so the screens can say it: under the generic 404 the portal and the office
        // both read "Nu am găsit ce ai cerut" about a month that is simply free.
        if (invoice.status === InvoiceStatus.WAIVED) {
            throw new NotFoundException({ message: 'Luna aceasta a fost consemnată fără plată, deci nu are factură', error: 'INVOICE_WAIVED_HAS_NO_PDF' });
        }

        try {
            return await this.s3Service.downloadFile(invoicePdfKey(invoice.monthIssued, invoice.id));
        } catch (error: unknown) {
            if (!(error instanceof ObjectNotFoundError)) throw error;

            // Issued in SmartBill and not kept yet — the fetch right after issuing is best effort.
            // Fetched now, kept, and handed over: the family's download is the fiscal document.
            if (invoice.fiscalStatus === InvoiceFiscalStatus.ISSUED && invoice.fiscalSeries && invoice.fiscalNumber) {
                const pdf = await this.fiscal.storeFiscalPdf(invoice, invoice.fiscalSeries, invoice.fiscalNumber);
                if (pdf) return pdf;
                throw new ServiceUnavailableException({
                    message: `SmartBill did not hand over the PDF of ${invoice.fiscalSeries} ${invoice.fiscalNumber}; try again shortly.`,
                    error: 'FISCAL_PDF_UNAVAILABLE',
                });
            }

            // The platform's own document: drawn from the row now, on its first download — E15/S6.
            // Issuing no longer draws anything, and a row written straight to the database (every
            // one `pnpm seed` creates) gets its PDF the same way instead of a 404.
            if (servesLocalPdf(invoice.fiscalStatus, smartBillMode())) {
                return this.drawLocalPdf(invoice);
            }

            // Queued for SmartBill in `live`: there is no document until SmartBill issues one, and
            // saying so beats a generic "not generated".
            throw new NotFoundException({
                message: 'The fiscal invoice has not been issued in SmartBill yet',
                error: 'FISCAL_INVOICE_NOT_ISSUED_YET',
            });
        }
    }

    /**
     * Draws the platform's PDF for an invoice and keeps it for the next download — E15/S6.
     *
     * Kept, not required to be kept: the row is the record and the PDF a drawing of it, so a storage
     * hiccup on the way back costs the next download a render, never this one its document. Two
     * downloads racing both draw and both put the same key, which is harmless.
     */
    private async drawLocalPdf(invoice: Invoice): Promise<Buffer> {
        const pdf = await this.pdfService.generateInvoicePdf(invoice);
        try {
            await this.s3Service.putObject({ key: invoicePdfKey(invoice.monthIssued, invoice.id), body: pdf, contentType: 'application/pdf' });
        } catch (error: unknown) {
            this.logger.warn(
                `Invoice ${invoice.id}: drew its PDF but could not keep it (${error instanceof Error ? error.message : String(error)}); the next download draws it again.`,
            );
        }
        return pdf;
    }

    /**
     * Drops the kept drawing of an invoice whose printed fields changed, or which is gone — E15/S6.
     *
     * After the commit, never inside it: storage has no rollback, and a PDF deleted for an edit that
     * then rolled back would only cost a redraw, while the other order could leave the old figures
     * standing. Best effort for the same reason `drawLocalPdf` is: what is left behind is a stale
     * drawing, which is logged, not a wrong record.
     */
    private async forgetLocalPdf(invoice: Pick<Invoice, 'id' | 'monthIssued'>): Promise<void> {
        try {
            await this.s3Service.deleteObject(invoicePdfKey(invoice.monthIssued, invoice.id));
        } catch (error: unknown) {
            this.logger.warn(`Invoice ${invoice.id}: could not drop its kept PDF (${error instanceof Error ? error.message : String(error)}).`);
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
     * The worksheet behind the issuing screen — every family, every child, every group, for a
     * month, **with the count already read** — E15/S9.
     *
     * It used to carry no amount, on the argument that a pre-computed total invites pressing the
     * button without reading it. That argument was about a number somebody *typed*: sending it back
     * would have been echoing an admin to themselves. The number is now counted from the registers,
     * so the screen's job is the opposite — to show the count, let it be unfolded to the sessions
     * behind it, and put the sessions with no register above everything, because those are the
     * money nobody is asking for.
     *
     * Rows come from **enrolments that touch the month**, not from `Child.group`: a child who left
     * on the 15th still owes the sessions before it, and a child enrolled on the 20th owes only what
     * came after. The group column on `Child` has no time in it and cannot answer either.
     *
     * `alreadyInvoiced` is what makes the screen re-runnable: an admin issues on the first, a family
     * enrols on the fifth, and the second run must invoice only them.
     *
     * The count is what reaches the price — unless there is a `SessionCountOverride` for the child
     * and month, in which case its number does, and the row carries both so the screen can say
     * "3, corectat din 4". The override is applied *here* rather than in the issuing path, so that
     * the worksheet and the invoice keep being the same number computed once.
     */
    async getWorksheet(monthIssued: string): Promise<InvoiceWorksheet> {
        const month = await this.billable.countForMonth(monthIssued);

        const invoiced = await this.invoiceRepository.find({ where: { monthIssued }, relations: { parent: true } });
        const invoicedAmountByParent = new Map(invoiced.map((invoice) => [invoice.parent?.id, invoice.amount]));

        const overrides = await this.overrideRepository.find({ where: { monthIssued }, relations: { child: true } });
        const overrideByChild = new Map(overrides.map((row) => [row.child.id, row]));

        const parentIds = [...new Set(month.children.map((child) => child.parentId))];
        const parents = parentIds.length === 0 ? [] : await this.profileRepository.find({ where: { id: In(parentIds) } });
        const discounts =
            parentIds.length === 0
                ? []
                : await this.discountRepository.find({ where: { monthIssued, parent: { id: In(parentIds) } }, relations: { parent: true } });

        const families: InvoiceWorksheetRow[] = [];
        for (const parent of parents) {
            const children = month.children
                .filter((child) => child.parentId === parent.id)
                .sort((a, b) => a.firstName.localeCompare(b.firstName))
                .map((child) => {
                    const count = month.counts.get(child.childId) ?? { sessions: 0, lines: [] };
                    const override = overrideByChild.get(child.childId);
                    return {
                        childId: child.childId,
                        childName: `${child.firstName} ${child.lastName}`,
                        groupId: child.groupId,
                        groupName: child.groupName,
                        weekday: child.weekday,
                        sessions: override ? override.sessions : count.sessions,
                        counted: count.sessions,
                        override: override ? { sessions: override.sessions, reason: override.reason } : null,
                        lines: count.lines,
                    };
                });
            const own = discounts.filter((discount) => discount.parent?.id === parent.id);
            const listAmount = amountForSessions(children.map((child) => child.sessions));
            families.push({
                parentId: parent.id,
                parentName: `${parent.lastName} ${parent.firstName}`,
                email: parent.email ?? null,
                alreadyInvoiced: invoicedAmountByParent.has(parent.id),
                invoicedAmount: invoicedAmountByParent.get(parent.id) ?? null,
                amount: sessionAmountAfterDiscounts(
                    children.map((child) => child.sessions),
                    own,
                ),
                listAmount,
                discounts: own.map((discount) => ({
                    id: discount.id,
                    name: discount.name,
                    type: discount.type,
                    value: discount.value,
                    off: discountTotal(listAmount, [discount]),
                })),
                children,
            });
        }
        families.sort((a, b) => a.parentName.localeCompare(b.parentName));

        return {
            month: month.month,
            from: month.from,
            to: month.to,
            // The same rule `issueFromSessions` refuses by, so the screen can say so before the press.
            issuable: monthIsTaught(monthIssued, schoolDay(issuingNow())),
            unmarked: month.unmarked,
            families,
        };
    }

    /**
     * Issues a month's invoices from the registers — E15/S9.
     *
     * The caller names the month and the date to print; everything else is read. Each family
     * enrolled for any part of the month gets exactly one row: an invoice when the count comes to
     * something, a `WAIVED` row with no document when it comes to nothing — "October, nothing owed"
     * is settled, while no row at all is a month somebody has to go and check. Families that already
     * have a row for the month are skipped and reported, which is what lets the screen be run again
     * after somebody enrols mid-month.
     *
     * Database work only — E15/S6. The fiscal document is the queue's (E16/S2), and the platform's
     * own PDF is drawn on its first download, so a hundred families are a hundred inserts rather
     * than a hundred renders and uploads inside one open transaction.
     *
     * The amount is the same one the worksheet showed, computed by the same code from the same
     * query. There is no path by which the screen and the invoice can disagree, because there is
     * no second number.
     */
    async issueFromSessions(
        dto: IssueMonthDto,
        actor: Actor,
    ): Promise<{ issued: Invoice[]; waived: Invoice[]; skipped: { parentId: number; reason: string }[] }> {
        // One mode for the whole month, read once: E16/S2. The fiscal documents themselves are made
        // afterwards by `FiscalIssuingService`, off this request — pressing "emite" never waits on
        // SmartBill, and SmartBill being down never undoes the month.
        const mode = smartBillMode();
        const now = new Date();

        // E15 S9: a month is issued once it has been taught, never before — the screen offered the
        // month in progress with its button enabled, and one press froze every family's October at
        // 0 lei (QA of 26 September 2026). And the date printed is a day that has happened: the
        // family's fourteen days run from it (E16 S7).
        const today = schoolDay(issuingNow());
        if (!monthIsTaught(dto.monthIssued, today)) {
            throw new ConflictException({
                message: `${dto.monthIssued} is taught until ${teachingMonthRange(dto.monthIssued).to}; it can be issued after that.`,
                error: 'MONTH_NOT_TAUGHT_YET',
            });
        }
        if (dto.dateIssued.slice(0, 10) > today) {
            throw new BadRequestException({
                message: `dateIssued ${dto.dateIssued.slice(0, 10)} is after today (${today}).`,
                error: 'INVOICE_DATE_IN_FUTURE',
            });
        }

        const { issued, waived, skipped, unmarked } = await this.dataSource.transaction(async (manager) => {
            // The month is read behind its lock, and so after anything that changes it and got there
            // first: a correction, a discount or a vacation tick saved in the same second is either
            // in what this reads or refused once this commits — never frozen on a month that did not
            // read it. A second press waits here, then finds every family already invoiced.
            await lockInvoiceMonth(manager, dto.monthIssued);
            const worksheet = await this.getWorksheet(dto.monthIssued);

            const passed: { parentId: number; reason: string }[] = [];
            const prepared: { parent: Profile; amount: number }[] = [];
            for (const family of worksheet.families) {
                if (family.alreadyInvoiced) {
                    passed.push({ parentId: family.parentId, reason: 'ALREADY_INVOICED' });
                    continue;
                }
                const parent = await this.profileRepository.findOne({ where: { id: family.parentId } });
                if (!parent) throw new NotFoundException(`Parent profile ${family.parentId} not found`);
                prepared.push({ parent, amount: family.amount });
            }

            const created: Invoice[] = [];
            const nil: Invoice[] = [];

            for (const { parent, amount } of prepared) {
                const invoice = new Invoice();
                invoice.amount = amount;
                invoice.dateIssued = parseIsoDate(dto.dateIssued.slice(0, 10));
                invoice.monthIssued = dto.monthIssued;
                // A month that comes to nothing is recorded, not skipped. The row is the whole
                // point: without it, a family with no October invoice looks the same as a family
                // whose October nobody got round to — and only one of those needs chasing.
                invoice.status = amount > 0 ? InvoiceStatus.PENDING : InvoiceStatus.WAIVED;
                invoice.parent = parent;
                Object.assign(invoice, fiscalStateAtIssue(amount, mode, now));

                const persisted = await manager.save(invoice);
                await this.recordInvoice(persisted, AuditAction.CREATED, actor, manager);

                if (amount > 0) {
                    created.push(persisted);
                } else {
                    // Never a document: there is nothing to print, nobody to ask for money, and an
                    // empty one in the family's file would only ever confuse whoever opened it.
                    nil.push(persisted);
                }
            }

            return { issued: created, waived: nil, skipped: passed, unmarked: worksheet.unmarked.length };
        });

        this.logger.log(
            `Month ${dto.monthIssued}: issued ${issued.length} invoice(s), waived ${waived.length}, skipped ${skipped.length} already invoiced; ${unmarked} session(s) had no register.`,
        );
        return { issued, waived, skipped };
    }

    /**
     * Records "bill this many for this child this month" — E15/S9, the override the school asked for.
     *
     * One row per child and month, replaced on a second decision rather than stacked: "bill three"
     * is what the person meant, and a history of three-then-two would only ever be read as the last
     * one. Who and when are on the row; the reason is optional because the school asked for it to
     * be, and because a required field that everybody fills with "ok" records nothing.
     *
     * Refused once the family's month is issued, for the same reason the vacation tick is
     * (E12/S8): it would change what was already billed, and the invoice would no longer be the
     * number the screen showed.
     */
    async setSessionCountOverride(dto: SessionCountOverrideDto, userId: number, actor: Actor): Promise<SessionCountOverride> {
        const child = await this.childRepository.findOne({ where: { id: dto.childId }, relations: { parent: true } });
        if (!child) throw new NotFoundException('Child not found');

        return this.dataSource.transaction(async (manager) => {
            // Behind the month's lock, and only then asked whether the month is still open: an issue
            // running in the same second has either committed — and this refuses — or waits.
            await lockInvoiceMonth(manager, dto.monthIssued);
            await this.assertMonthOpenFor(child, dto.monthIssued, manager);

            const existing = await manager.findOne(SessionCountOverride, { where: { monthIssued: dto.monthIssued, child: { id: child.id } } });
            // The row keeps who decided and why, but only for the decision standing now — a second
            // decision replaces the first. The trail is where "four, then two, then four again" can
            // still be read afterwards, which is the whole reason a hand-typed number is audited.
            const before = existing ? { sessions: existing.sessions, reason: existing.reason } : null;
            const row = existing ?? this.overrideRepository.create({ child, monthIssued: dto.monthIssued });
            row.sessions = dto.sessions;
            row.reason = dto.reason ?? null;
            row.createdBy = { id: userId } as User;

            const saved = await manager.save(SessionCountOverride, row);
            const after = { sessions: saved.sessions, reason: saved.reason };
            const note = `copil ${child.id}, luna ${dto.monthIssued}`;
            if (before) {
                await this.audit.recordUpdate(
                    { actor, entityType: 'SessionCountOverride', entityId: saved.id, before, after, fields: ['sessions', 'reason'], note },
                    manager,
                );
            } else {
                await this.audit.record(
                    {
                        actor,
                        action: AuditAction.CREATED,
                        entityType: 'SessionCountOverride',
                        entityId: saved.id,
                        changes: snapshotFields(after, 'created'),
                        note,
                    },
                    manager,
                );
            }
            return saved;
        });
    }

    /** Removes the decision; the registers speak again. Same freeze as setting it. */
    async clearSessionCountOverride(monthIssued: string, childId: number, actor: Actor): Promise<void> {
        const child = await this.childRepository.findOne({ where: { id: childId }, relations: { parent: true } });
        if (!child) throw new NotFoundException('Child not found');

        await this.dataSource.transaction(async (manager) => {
            await lockInvoiceMonth(manager, monthIssued);
            await this.assertMonthOpenFor(child, monthIssued, manager);

            const existing = await manager.findOne(SessionCountOverride, { where: { monthIssued, child: { id: child.id } } });
            // Nothing on file is not an act: a delete that removed no row would otherwise leave an
            // entry claiming a decision was withdrawn that nobody ever made.
            if (!existing) return;

            // By id, now that the row is in hand: the index makes it the only one, and a criteria
            // object with a relation in it is a shape `delete` reads differently from `findOne`.
            await manager.delete(SessionCountOverride, existing.id);
            await this.audit.record(
                {
                    actor,
                    action: AuditAction.DELETED,
                    entityType: 'SessionCountOverride',
                    entityId: existing.id,
                    changes: snapshotFields({ sessions: existing.sessions, reason: existing.reason }, 'deleted'),
                    note: `copil ${child.id}, luna ${monthIssued}`,
                },
                manager,
            );
        });
    }

    private async assertMonthOpenFor(child: Child, monthIssued: string, manager: EntityManager): Promise<void> {
        if (!child.parent) return;
        const invoice = await manager.findOne(Invoice, { where: { monthIssued, parent: { id: child.parent.id } } });
        if (invoice) {
            throw new ConflictException({
                message: `Luna ${monthIssued} e deja facturată pentru familia asta — numărul nu se mai poate schimba.`,
                error: 'MONTH_ALREADY_INVOICED',
            });
        }
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
