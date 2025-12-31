import { Column, Entity, OneToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Invoice } from './invoice.entity';

@Entity('payments')
export class Payment {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @OneToOne(() => Invoice, (invoice) => invoice.payment, { onDelete: 'CASCADE' })
    invoice: Invoice;

    @Column({ type: 'varchar', length: 100, nullable: false, default: 'cash' })
    method: string;

    @Column({ type: 'date', nullable: false })
    date: Date;
}
