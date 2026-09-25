import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Invoice } from './invoice.entity';
import { User } from './user.entity';
import { PaymentMethod } from '../enum/payment-method.enum';
import { PaymentStatus } from '../enum/payment-status.enum';
import { decimalAsNumber } from './decimal.transformer';

/**
 * Where a payment stands with SmartBill — E16/S5. The invoice's fiscal queue, one level down.
 *
 * `null` means the payment never goes there: it is not money yet (`initiated`, `failed`), the
 * invoice is not a fiscal document in SmartBill (issued in `off` or as a `draft`), or the mode was
 * not `live` when it was recorded. The rest mirrors `InvoiceFiscalStatus`:
 *
 *  - `PENDING` — waiting for `PaymentFiscalService`. Also while the invoice itself is still on its
 *    way to SmartBill: a collection needs the invoice's number, so it waits for it.
 *  - `UNCERTAIN` — a request is in the air, or went up and no answer came back. Written *before* the
 *    call. The next pass reads the invoice's paid amount in SmartBill to learn what happened.
 *  - `REVIEW` — the paid amount moved while the answer was lost. A person looks in SmartBill and
 *    confirms, or says it is not there. The platform never marks as recorded what it did not see.
 *  - `RECORDED` — the collection is on the invoice in SmartBill; a cash one has its receipt number.
 *  - `FAILED` — SmartBill refused it. Nothing was recorded; somebody fixes the cause and retries.
 */
export enum PaymentFiscalStatus {
    PENDING = 'pending',
    UNCERTAIN = 'uncertain',
    REVIEW = 'review',
    RECORDED = 'recorded',
    FAILED = 'failed',
}

/**
 * The states in which the collection exists in SmartBill, or may. Its amount, date and method can no
 * longer change here, and the row cannot be deleted: SmartBill would keep a record the platform no
 * longer has. The way out is a reversal — the payment becomes `reversed` here, and the collection
 * is removed in SmartBill by hand, which the divergence report (E16/S8) points at until it is.
 */
export const PAYMENT_RECORD_MAY_EXIST: readonly PaymentFiscalStatus[] = [
    PaymentFiscalStatus.UNCERTAIN,
    PaymentFiscalStatus.REVIEW,
    PaymentFiscalStatus.RECORDED,
];

/**
 * One sum of money, received once — E16/S1.
 *
 * Reworked from a one-to-one flag on the invoice: the old shape had no amount, so "paid" was a bit,
 * not a figure, no payment could ever be reconciled against a bank statement, and a family paying
 * in two instalments was unrepresentable. Now the invoice's paid state is *derived* from the sum of
 * succeeded payments (`PaymentService.recomputeInvoiceStatus`, the single writer) rather than set
 * by hand next to the row that justifies it.
 */
@Entity('payments')
@Index('IDX_payments_invoice_id', ['invoice'])
@Index('IDX_payments_recorded_by_id', ['recordedBy'])
// The claim reads due rows by state and time, like the invoices' fiscal queue.
@Index('IDX_payments_fiscal_queue', ['fiscalStatus', 'fiscalNextAttemptAt'])
export class Payment {
    @PrimaryGeneratedColumn('increment')
    id: number;

    /** Many payments per invoice — that is the whole point of the rework. */
    @ManyToOne(() => Invoice, (invoice) => invoice.payments, { onDelete: 'CASCADE', nullable: false })
    @JoinColumn({ name: 'invoice_id' })
    invoice: Invoice;

    @Column({ type: 'decimal', precision: 10, scale: 2, transformer: decimalAsNumber })
    amount: number;

    @Column({ type: 'enum', enum: PaymentMethod, default: PaymentMethod.CASH })
    method: PaymentMethod;

    @Column({ type: 'enum', enum: PaymentStatus, default: PaymentStatus.SUCCEEDED })
    status: PaymentStatus;

    /** The day the money moved, not the day somebody typed it in — that one is `createdAt`. */
    @Column({ type: 'date' })
    date: Date;

    /**
     * The payment-order or cash-receipt number: the only thing a sum can be found by in a bank
     * statement, which makes it the key reconciliation (E16 S8) will join on.
     */
    @Column({ type: 'varchar', length: 100, nullable: true })
    externalReference: string | null;

    /** See `PaymentFiscalStatus`. */
    @Column({ type: 'enum', enum: PaymentFiscalStatus, nullable: true })
    fiscalStatus: PaymentFiscalStatus | null;

    /**
     * The receipt SmartBill numbered for a cash payment — the document the family can be handed.
     * Empty for a bank transfer: SmartBill records those on the invoice without a document.
     */
    @Column({ type: 'varchar', length: 20, nullable: true })
    fiscalReceiptSeries: string | null;

    @Column({ type: 'varchar', length: 20, nullable: true })
    fiscalReceiptNumber: string | null;

    @Column({ type: 'timestamptz', nullable: true })
    fiscalRecordedAt: Date | null;

    /** Requests sent, doubling as the row's version: every write after a claim is conditional on it. */
    @Column({ type: 'int', default: 0 })
    fiscalAttempts: number;

    /** When the queue may take the row next — or, while `UNCERTAIN`, when its lease runs out. */
    @Column({ type: 'timestamptz', nullable: true })
    fiscalNextAttemptAt: Date | null;

    /**
     * What the invoice's paid amount in SmartBill was just before the request went out — written
     * *before* it goes. A lost answer is settled against it: unchanged means nothing was recorded.
     */
    @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, transformer: decimalAsNumber })
    fiscalExpectedPaid: number | null;

    /** For a receipt, the series' next number before the request: the number it would have taken. */
    @Column({ type: 'int', nullable: true })
    fiscalExpectedNumber: number | null;

    /** SmartBill's own sentence for a refusal, or what went wrong with the last attempt. */
    @Column({ type: 'varchar', length: 1000, nullable: true })
    fiscalLastError: string | null;

    @Column({ type: 'varchar', length: 500, nullable: true })
    notes: string | null;

    /**
     * The admin who typed it in. SET NULL, not CASCADE: deleting an account must not erase the
     * school's record that money arrived.
     */
    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'recorded_by_id' })
    recordedBy: User | null;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;
}
