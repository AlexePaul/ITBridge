import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Profile } from './profile.entity';
import { Payment } from './payment.entity';

export enum InvoiceStatus {
    PENDING = 'pending',
    PAID = 'paid',
    OVERDUE = 'overdue',
    /**
     * The month was handled and the family owes nothing — E15.
     *
     * A child who could not come at all, or a month the school decided not to charge for. The row
     * exists precisely **because** there is no money in it: without it, a family with no invoice for
     * October is indistinguishable from a family whose October nobody got round to, and the second
     * is the one you need to find. Amount is zero, no PDF is generated, and nothing is sent — there
     * is nothing to print and nobody to ask for money.
     */
    WAIVED = 'waived',
}

/**
 * Where the invoice stands with SmartBill, the school's fiscal system — E16/S2.
 *
 * `null` on the column means the invoice never went there and never will: issued while the mode was
 * `off`, before the integration existed, or a waived month with nothing to invoice. The rest is a
 * queue with one state that matters more than the others, `UNCERTAIN`:
 *
 *  - `PENDING` — waiting for `FiscalIssuingService` to send it.
 *  - `UNCERTAIN` — a request is in the air, or went up and no answer came back. Written *before* the
 *    call, so a process that dies mid-request leaves exactly this behind. Nothing else is sent while
 *    a row is in this state: the next pass asks the series whether anything was issued, and only a
 *    series that did not move sends the invoice again.
 *  - `REVIEW` — the series moved while the answer was lost. The invoice was probably issued, and a
 *    person confirms the number in SmartBill or says it is not there. The platform never adopts a
 *    fiscal number it did not see come back.
 *  - `DRAFT` — sent in `draft` mode: a draft in SmartBill with no number, not a fiscal document.
 *  - `ISSUED` — a real invoice exists, with the series and number below.
 *  - `FAILED` — SmartBill refused it (a missing series, a VAT rate the account lacks). Nothing was
 *    issued; somebody fixes the cause and retries.
 */
export enum InvoiceFiscalStatus {
    PENDING = 'pending',
    UNCERTAIN = 'uncertain',
    REVIEW = 'review',
    DRAFT = 'draft',
    ISSUED = 'issued',
    FAILED = 'failed',
}

/**
 * The fiscal states in which a document exists in SmartBill, or may: the invoice can no longer be
 * deleted or have its amount changed here, because the platform's row would stop matching a fiscal
 * record it cannot touch. The fix for a wrong one is a storno in SmartBill, not an edit.
 */
export const FISCAL_DOCUMENT_MAY_EXIST: readonly InvoiceFiscalStatus[] = [
    InvoiceFiscalStatus.UNCERTAIN,
    InvoiceFiscalStatus.REVIEW,
    InvoiceFiscalStatus.ISSUED,
];

@Entity('invoices')
@Unique(['parent', 'monthIssued'])
// The fiscal queue's claim, the same shape as `IDX_outbox_claim`: due rows by state and time.
@Index('IDX_invoices_fiscal_queue', ['fiscalStatus', 'fiscalNextAttemptAt'])
export class Invoice {
    @PrimaryGeneratedColumn('increment')
    id: number;

    // link to parent profile (owner side). map to profile.invoices (was incorrectly profile.children)
    @ManyToOne(() => Profile, (profile) => profile.invoices, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'parent_id' })
    parent: Profile;

    // store monetary value as string in DB (decimal) but expose as number in app via transformer
    @Column({
        type: 'decimal',
        precision: 10,
        scale: 2,
        transformer: {
            to: (value: number) => value,
            from: (value: string) => parseFloat(value),
        },
    })
    amount: number;

    @Column({ type: 'date' })
    dateIssued: Date;

    @Column({ type: 'varchar', length: 7 })
    monthIssued: string; // e.g., '2023-09'

    @Column({ type: 'enum', enum: InvoiceStatus, default: InvoiceStatus.PENDING })
    status: InvoiceStatus;

    /**
     * Every sum received against this invoice — E16/S1. Many, not one: a family can pay in
     * instalments, and each instalment has its own date, method and reference. Whether the invoice
     * is paid is derived from the succeeded ones by `PaymentService.recomputeInvoiceStatus`, the
     * only writer of the derived state — `status` is never set by hand next to a payment.
     */
    @OneToMany(() => Payment, (payment) => payment.invoice)
    payments: Payment[];

    /** See `InvoiceFiscalStatus`. `null`: never sent to SmartBill, and not meant to be. */
    @Column({ type: 'enum', enum: InvoiceFiscalStatus, nullable: true })
    fiscalStatus: InvoiceFiscalStatus | null;

    /** The series SmartBill issued on. Set only when `ISSUED`. */
    @Column({ type: 'varchar', length: 20, nullable: true })
    fiscalSeries: string | null;

    /** The number SmartBill gave, as it gave it — a string, with the account's zero-padding. */
    @Column({ type: 'varchar', length: 20, nullable: true })
    fiscalNumber: string | null;

    /** SmartBill's own id for the document, drafts included. */
    @Column({ type: 'integer', nullable: true })
    fiscalDocumentId: number | null;

    /** The document's page in SmartBill Cloud. Needs a SmartBill login — for the office, not the family. */
    @Column({ type: 'varchar', length: 500, nullable: true })
    fiscalDocumentUrl: string | null;

    /** SmartBill's public link to the PDF, meant for the family: it opens without a login. */
    @Column({ type: 'varchar', length: 500, nullable: true })
    fiscalViewUrl: string | null;

    /** When SmartBill accepted it — a draft or an invoice. */
    @Column({ type: 'timestamptz', nullable: true })
    fiscalIssuedAt: Date | null;

    /** How many times SmartBill was actually asked. A configuration failure or a lock-out gives the attempt back. */
    @Column({ type: 'integer', default: 0 })
    fiscalAttempts: number;

    /** When the queue may look at the row again; for `UNCERTAIN`, the end of the lease on the request in the air. */
    @Column({ type: 'timestamptz', nullable: true })
    fiscalNextAttemptAt: Date | null;

    /**
     * The series' `nextNumber`, read just before the request went up — written *before* the call, so
     * a row that has it was sent, and a row that lacks it was not. `reconcile` decides from it.
     */
    @Column({ type: 'integer', nullable: true })
    fiscalExpectedNumber: number | null;

    /** SmartBill's words when it refused, or why the queue is waiting. Cleared on success. */
    @Column({ type: 'varchar', length: 1000, nullable: true })
    fiscalLastError: string | null;
}
