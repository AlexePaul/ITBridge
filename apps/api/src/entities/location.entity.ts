import { Column, Entity, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Room } from './room.entity';
import { decimalAsNumber } from './decimal.transformer';

/**
 * One of the school's physical addresses.
 *
 * The fields go beyond what the admin screens need on purpose: `slug` and the coordinates exist so
 * that E19 can build a public page and a `LocalBusiness` node per location without a second,
 * hand-written copy of the same address. What the public site reads today still lives in
 * `apps/web/shared/school.ts` — the public pages never call this API — so the two are seeded from
 * the same values and E19/S4 decides which one wins when a location page becomes dynamic.
 */
@Entity('locations')
@Unique('UQ_locations_slug', ['slug'])
export class Location {
    @PrimaryGeneratedColumn('increment')
    id: number;

    /** How the location is referred to in running text: "Drumul Taberei". */
    @Column({ type: 'varchar', length: 120 })
    name: string;

    /** URL segment, and the stable identifier the frontend matches on. */
    @Column({ type: 'varchar', length: 120 })
    slug: string;

    @Column({ type: 'varchar', length: 255 })
    street: string;

    @Column({ type: 'varchar', length: 100 })
    city: string;

    /** Sector or county. Nullable because not every Romanian address has one worth storing. */
    @Column({ type: 'varchar', length: 100, nullable: true })
    district: string | null;

    @Column({ type: 'varchar', length: 20, nullable: true })
    postalCode: string | null;

    // `numeric(9, 6)` holds ~10cm of precision, which is far more than a building needs, and the
    // transformer keeps the driver from handing back "44.415847" as a string.
    @Column({ type: 'decimal', precision: 9, scale: 6, transformer: decimalAsNumber })
    latitude: number;

    @Column({ type: 'decimal', precision: 9, scale: 6, transformer: decimalAsNumber })
    longitude: number;

    /** Both nullable: a location without its own line falls back to the school's. */
    @Column({ type: 'varchar', length: 30, nullable: true })
    phone: string | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    email: string | null;

    /**
     * Opening hours, when they differ from the school's. `null` means "the school's hours apply",
     * which is true of both locations today — storing a copy of the shared schedule on each row
     * would be a second source of truth that nothing keeps in step.
     */
    @Column({ type: 'varchar', length: 255, nullable: true })
    openingHours: string | null;

    @Column({ type: 'boolean', default: true })
    isActive: boolean;

    @OneToMany(() => Room, (room) => room.location)
    rooms: Room[];
}
