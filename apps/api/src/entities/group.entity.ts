import { Check, Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Child } from './child.entity';
import { Room } from './room.entity';
import { Weekday } from '../enum/weekday.enum';

@Entity('groups')
// The old constraint was `['weekday', 'startTime']`, which said no two groups anywhere in the
// school may share a slot — impossible for a school with two locations, and worked around in
// practice by shifting start times, which quietly made the timetable wrong. The room is what
// cannot be in two places at once.
@Unique('UQ_groups_room_weekday_start', ['room', 'weekday', 'startTime'])
// Declared here as well as in the migration, so `check:schema` sees entity and database agree.
// The TypeScript enum stops a bad literal at a call site; this stops one arriving any other way.
@Check('CHK_groups_weekday_iso', '"weekday" BETWEEN 1 AND 7')
@Check('CHK_groups_capacity_positive', '"capacity" > 0')
export class Group {
    @PrimaryGeneratedColumn('increment')
    id: number;

    /** What an admin calls it: "Scratch Începători". */
    @Column({ type: 'varchar', length: 120 })
    name: string;

    /**
     * ISO weekday, 1 = Monday through 7 = Sunday.
     *
     * Stored as an int rather than a Postgres enum, because the values are ordinals and sorting by
     * them has to give the week in order. A CHECK constraint keeps 0 and 8 out; the `Weekday` enum
     * keeps `weekday: 6` from appearing at a call site.
     */
    @Column({ type: 'int' })
    weekday: Weekday;

    @Column({ type: 'time' })
    startTime: string;

    @Column({ type: 'time' })
    endTime: string;

    // Not nullable: a group happens somewhere, and the room is how it knows which location it
    // belongs to. RESTRICT for the same reason rooms restrict their location.
    @ManyToOne(() => Room, (room) => room.groups, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'room_id' })
    room: Room;

    /** How many children may be enrolled. Waiting lists and the enforcement live in E11. */
    @Column({ type: 'int' })
    capacity: number;

    // Ages were `decimal`, which is a strange thing for a child's age to be and forced a
    // transformer to keep the driver from returning "11". Nobody has ever needed half a year of
    // resolution here, and E10 may replace the pair outright with the level from the catalogue.
    @Column({ type: 'int' })
    minAge: number;

    @Column({ type: 'int' })
    maxAge: number;

    @OneToMany(() => Child, (child) => child.group)
    children: Child[];

    @Column({ type: 'boolean', default: true })
    isActive: boolean;
}
