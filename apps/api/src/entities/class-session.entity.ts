import { Column, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Group } from './group.entity';
import { Room } from './room.entity';
import { Attendance } from './attendance.entity';
import { ClassSessionStatus } from '../enum/class-session-status.enum';

/**
 * One class of one group, on one day. The timetable, made explicit.
 *
 * Until now a session was implied: `Group.weekday` plus `Group.startTime` said when a group meets,
 * and `Attendance` carried its own copy of the date and the hour. Nothing could be cancelled,
 * nothing could be moved, and two attendance rows for the same class could disagree about when it
 * was. A session is a row now, and `Attendance` points at it.
 *
 * The name is `ClassSession`, on `class_sessions`, because `Session` is taken: `session.entity.ts`
 * is one row per refresh token, shipped in E05/S7, and two entity classes cannot share a name.
 * Renaming that one would mean a table migration on the only mechanism by which anyone logs out,
 * to free up five letters. See E12, "Decizii luate".
 *
 * **No module and no lesson.** E12/S1 describes a session as belonging to a module from E10 and
 * teaching a lesson from it. E10 is not being built — it was cut as non-MVP. Should it ever be,
 * this is where it attaches: a nullable `module` and `lesson` relation here, and the generation
 * that today runs on a rolling horizon becomes generation for the length of a module. The absence
 * is a decision, not an oversight.
 *
 * **No teacher either**, for the same kind of reason: there is no teacher entity in this codebase
 * yet, only the `ADMIN` and `PARENT` roles.
 */
@Entity('class_sessions')
// A group meets once on a given day. This is what makes generation idempotent: the second run
// collides with the first instead of doubling the timetable.
//
// It also rules out a group being taught twice in one day, which is the price of the guarantee. If
// that ever becomes real — a make-up class for the whole group on a Saturday, say — the key grows
// a `startTime`, and generation has to find another way to recognise what it already wrote.
@Unique('UQ_class_sessions_group_date', ['group', 'date'])
export class ClassSession {
    @PrimaryGeneratedColumn('increment')
    id: number;

    // CASCADE: deleting a group takes its timetable with it. Unlike a room, a group is not shared
    // infrastructure — its sessions mean nothing without it, and the attendance rows hanging off
    // them cascade in turn.
    @ManyToOne(() => Group, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'group_id' })
    group: Group;

    @Column({ type: 'date' })
    date: Date;

    @Column({ type: 'time' })
    startTime: string;

    @Column({ type: 'time' })
    endTime: string;

    /**
     * Where it is actually taught, copied from the group at generation time rather than read
     * through `group.room`.
     *
     * The copy is deliberate and is not the duplication that `date`/`startTime` on `Attendance`
     * were. Moving a group to another room is a change to the future, not to the past: reading the
     * room through the group would silently rewrite every session already taught, and the answer
     * to "which room was this class in?" would change every time an admin moved a group. A single
     * session can also be relocated on its own without moving the group.
     *
     * RESTRICT, like every other reference to a room: a room is emptied before it is deleted.
     */
    @ManyToOne(() => Room, { nullable: false, onDelete: 'RESTRICT' })
    @JoinColumn({ name: 'room_id' })
    room: Room;

    @Column({ type: 'enum', enum: ClassSessionStatus, default: ClassSessionStatus.SCHEDULED })
    status: ClassSessionStatus;

    /** Free text for whoever taught it or cancelled it: "profesor bolnav", "sală schimbată". */
    @Column({ type: 'text', nullable: true })
    notes: string | null;

    /**
     * Held in a school holiday, for whoever wanted to come — E12/S8.
     *
     * A fact about the hour, recorded where the person who knows it is: the teacher in the room,
     * that day. Three weeks later, at the issuing screen, nobody remembers which Monday in December
     * was the break and which was just a day with four children. What the tick *means* for money is
     * E15/S9's — billed only to the children marked present — and is not decided here.
     *
     * Not a status. `status` says whether the class exists; this says what kind of class it was.
     * A cancelled session cannot carry it, and the service refuses the combination.
     */
    @Column({ type: 'boolean', default: false })
    isVacation: boolean;

    @OneToMany(() => Attendance, (attendance) => attendance.classSession)
    attendances: Attendance[];
}
