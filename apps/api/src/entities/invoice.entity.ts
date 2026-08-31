import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';
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

@Entity('invoices')
@Unique(['parent', 'monthIssued'])
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
}
