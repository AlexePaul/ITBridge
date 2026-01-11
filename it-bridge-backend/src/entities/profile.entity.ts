import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, RelationId, OneToMany } from 'typeorm';
import { User } from './user.entity';
import { Child } from './child.entity';
import { Invoice } from './invoice.entity';
import { Discount } from './discount.entity';

@Entity('profiles')
export class Profile {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @OneToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({ unique: true, length: 255, nullable: true })
    email?: string;

    @Column({ unique: true, type: 'varchar', length: 30, nullable: true })
    phone?: string;

    @Column({ type: 'varchar', length: 100 })
    firstName: string;

    @Column({ type: 'varchar', length: 100 })
    lastName: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    address?: string;

    @OneToMany(() => Child, (child) => child.parent)
    children: Child[];

    @OneToMany(() => Invoice, (invoice) => invoice.parent)
    invoices: Invoice[];

    @OneToMany(() => Discount, (discount) => discount.parent)
    discounts: Discount[];
}
