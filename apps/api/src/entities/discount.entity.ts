import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Profile } from './profile.entity';
import { decimalAsNumber } from './decimal.transformer';

@Entity('discounts')
export class Discount {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @Column({ type: 'varchar', length: 100 })
    name: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    description?: string;

    // Declared `number`, and it was a string on the wire until this transformer. `calculateAmount`
    // only survived it because `totalAmount -= discount.value` coerces; a `+=` would have
    // concatenated and produced a nonsense invoice.
    @Column({ type: 'decimal', transformer: decimalAsNumber })
    value: number;

    @Column({ type: 'varchar', length: 7 })
    monthIssued: string; // e.g., '2023-09'

    @ManyToOne(() => Profile, (profile) => profile.discounts, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'parent_id' })
    parent: Profile;
}
