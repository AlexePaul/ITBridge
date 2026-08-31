import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Invoice } from './invoice.entity';
import { User } from './user.entity';
import { PaymentMethod } from '../enum/payment-method.enum';
import { PaymentStatus } from '../enum/payment-status.enum';
import { decimalAsNumber } from './decimal.transformer';

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

    /** The receipt's id in SmartBill, once E16 S2 starts pushing them there. Empty until then. */
    @Column({ type: 'varchar', length: 100, nullable: true })
    smartbillReference: string | null;

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
