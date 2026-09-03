import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, OneToMany } from 'typeorm';
import { MessageFrequency } from '../enum/message-frequency.enum';
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
    user?: User | null;

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

    /**
     * Who to call when a child is hurt at the school and the parent's own number rings out.
     *
     * The three columns below are required of a parent who registers (E11/S2) and left nullable in
     * the schema, because the other road to a `Profile` — an admin typing a family in from a phone
     * call — is a deliberate flow that has never had them. Requiring them in the column would break
     * that flow to enforce a rule that belongs to one of the two doors, not to the room.
     *
     * This is the *only* field kept from the child-safety proposal (E11/D4). Health data, incident
     * notes and authorised pick-up persons are out of scope in writing, so that they are not added
     * back one field at a time on the grounds that the neighbouring column already exists.
     */
    @Column({ type: 'varchar', length: 200, nullable: true })
    emergencyContactName?: string;

    /** How that person is related to the child — "bunica", "unchi". Free text; nobody enumerates families. */
    @Column({ type: 'varchar', length: 100, nullable: true })
    emergencyContactRelation?: string;

    /** Not unique, unlike `phone`: two siblings' families may well name the same grandparent. */
    @Column({ type: 'varchar', length: 30, nullable: true })
    emergencyContactPhone?: string;

    @OneToMany(() => Child, (child) => child.parent)
    children: Child[];

    @OneToMany(() => Invoice, (invoice) => invoice.parent)
    invoices: Invoice[];

    @OneToMany(() => Discount, (discount) => discount.parent)
    discounts: Discount[];

    /**
     * Whether the family agreed to hear from the school about anything other than their own
     * business — E17/S4.
     *
     * **Defaults to false**, and that is a decision rather than a shrug: consent nobody gave is not
     * consent, and a column defaulting to true would make the first newsletter the moment the
     * school discovers whether it was allowed to send it. A parent turns it on from their own
     * settings.
     *
     * It gates marketing and nothing else. Invoices, receipts, a cancelled class and the child's
     * own work are the school performing its contract, and they are never on a checkbox — if they
     * were, refusing marketing would cost a family the things they are owed, and the consent would
     * stop being freely given, which would invalidate it for marketing too.
     */
    @Column({ type: 'boolean', default: false })
    marketingOptIn: boolean;

    /**
     * How often the family wants their post — E17/S6.
     *
     * **Packaging, never delivery.** Unlike `marketingOptIn` above, this cannot suppress anything:
     * a family on `WEEKLY` receives everything a family on `IMMEDIATE` does, in fewer envelopes, and
     * urgent messages ignore it completely. That is what makes `DAILY` a safe default — and the
     * default is deliberate, because S6's acceptance is stated about a parent, not about a parent
     * who went and found a setting.
     */
    @Column({ type: 'enum', enum: MessageFrequency, default: MessageFrequency.DAILY })
    messageFrequency: MessageFrequency;
}
