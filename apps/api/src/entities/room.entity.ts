import { Check, Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Location } from './location.entity';
import { Group } from './group.entity';

/**
 * A teaching room inside a location. Two rooms in different locations may share a name, so the
 * uniqueness is on the pair.
 */
@Entity('rooms')
@Unique('UQ_rooms_location_name', ['location', 'name'])
// Declared on the entity as well as in the migration, so `check:schema` sees the two agree.
@Check('CHK_rooms_capacity_positive', '"capacity" > 0')
@Check('CHK_rooms_computers_non_negative', '"computers" >= 0')
export class Room {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @Column({ type: 'varchar', length: 120 })
    name: string;

    // RESTRICT rather than CASCADE: a location with rooms is deleted by emptying it first. The
    // service turns the resulting error into a 409, so nobody removes a location and silently
    // takes its rooms — and every group in them — along.
    @ManyToOne(() => Location, (location) => location.rooms, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'location_id' })
    location: Location;

    /** How many children fit. The group's own capacity may be lower, never higher. */
    @Column({ type: 'int' })
    capacity: number;

    /** Equipment, in the only detail that has come up so far: how many children can sit at a machine. */
    @Column({ type: 'int', default: 0 })
    computers: number;

    @Column({ type: 'boolean', default: false })
    hasProjector: boolean;

    @Column({ type: 'boolean', default: false })
    hasWhiteboard: boolean;

    @Column({ type: 'boolean', default: true })
    isActive: boolean;

    @OneToMany(() => Group, (group) => group.room)
    groups: Group[];
}
