import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Location } from './location.entity';

/**
 * A stretch of days on which the school does not teach — E12/S2.
 *
 * **A period, not a day.** A fortnight of school holiday is one row; a public holiday is one row
 * with the same date at both ends. The Romanian school year comes to five holiday stretches plus
 * five or six national days, so this table is under a dozen rows a year, typed once from the
 * ministry's order.
 *
 * Storing days instead would have meant fourteen rows for one holiday, each of which somebody could
 * mistype or miss, and no way to say what the holiday was called.
 *
 * Until this existed, the generator wrote sessions straight through the winter break and somebody
 * had to remember to cancel them by hand every December. A thing you must remember every December
 * is a thing you will one December forget — and then the unmarked-attendance report asks the school
 * to account for classes that never happened.
 */
@Entity('non_teaching_periods')
export class NonTeachingPeriod {
    @PrimaryGeneratedColumn('increment')
    id: number;

    /** "Vacanța de iarnă", "1 Decembrie". Shown on the screen and in the reason of a cancelled class. */
    @Column({ type: 'varchar', length: 120 })
    name: string;

    @Index()
    @Column({ type: 'date' })
    startDate: string;

    /** Inclusive. Equal to `startDate` for a single day, which is most of them. */
    @Column({ type: 'date' })
    endDate: string;

    /**
     * Which location this applies to. **`null` means the whole school**, which is the case for every
     * national holiday and every school break — that is, for all of them today.
     *
     * The column exists because S2 asks for it and because the two addresses could one day keep
     * different hours. Making it nullable rather than requiring a row per location is what keeps the
     * common case to one row instead of two that must be edited together.
     */
    @ManyToOne(() => Location, { nullable: true, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'location_id' })
    location?: Location | null;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;
}
