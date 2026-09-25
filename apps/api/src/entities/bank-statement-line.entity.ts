import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Payment } from './payment.entity';
import { decimalAsNumber } from './decimal.transformer';

/**
 * One line of money coming in, as the bank's statement has it — E16/S8.
 *
 * A table of its own, unlike the queues, because a line is not a state of a row that already
 * exists: most of what arrives on the account is a family paying an invoice, but a refund, a grant
 * or a mistake arrive the same way, and they have to be somewhere while a person decides what they
 * are. **Where a line stands is derived, not stored**: matched when it has a payment, ignored when
 * somebody said it is not a family paying, waiting otherwise. A payment deleted later (only possible
 * while SmartBill has not recorded it) leaves the line waiting again by itself, through `SET NULL`.
 */
@Entity('bank_statement_lines')
@Index('IDX_bank_statement_lines_payment_id', ['payment'])
@Index('IDX_bank_statement_lines_booked_on', ['bookedOn'])
export class BankStatementLine {
    @PrimaryGeneratedColumn('increment')
    id: number;

    /**
     * The line's content and its place among identical ones, hashed. Unique, so importing a
     * statement twice — or two statements that overlap — adds nothing the second time.
     */
    @Index('UQ_bank_statement_lines_fingerprint', { unique: true })
    @Column({ type: 'varchar', length: 64 })
    fingerprint: string;

    /** The day the bank booked it — the day the money arrived, which is the payment's day. */
    @Column({ type: 'date' })
    bookedOn: Date;

    /** Always positive: only incoming money is kept. */
    @Column({ type: 'decimal', precision: 10, scale: 2, transformer: decimalAsNumber })
    amount: number;

    /** The transfer's details as the bank wrote them — where a family puts the invoice's number. */
    @Column({ type: 'varchar', length: 500 })
    description: string;

    /** Who sent it, when the export says. Often a parent; sometimes a grandparent, or a company. */
    @Column({ type: 'varchar', length: 200, nullable: true })
    counterparty: string | null;

    @Column({ type: 'varchar', length: 100, nullable: true })
    bankReference: string | null;

    /** The payment it became. `SET NULL`: a deleted payment puts the line back in the queue. */
    @ManyToOne(() => Payment, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'payment_id' })
    payment: Payment | null;

    /** Set when somebody said the line is not a family paying an invoice. */
    @Column({ type: 'timestamptz', nullable: true })
    ignoredAt: Date | null;

    @CreateDateColumn({ type: 'timestamptz' })
    importedAt: Date;
}
