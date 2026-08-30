import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Child } from './child.entity';
import { Group } from './group.entity';
import { ClassSession } from './class-session.entity';
import { AttendanceType } from '../enum/attendance-type.enum';

@Entity('attendances')
// Was `['child', 'date', 'startTime']`, back when a class was a date and an hour rather than a row.
// One mark per child per session is the same rule stated against the thing it is actually about,
// and it no longer depends on two groups never starting at the same minute.
@Unique('UQ_attendances_child_class_session', ['child', 'classSession'])
export class Attendance {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @ManyToOne(() => Child, (child) => child.attendances, { onDelete: 'CASCADE' })
    child: Child;

    /**
     * The class this mark is about. Carries the date, the start and end times, the room and the
     * status — everything this row used to hold its own copy of.
     *
     * CASCADE: deleting a session deletes the marks for it. A mark without a class is not data,
     * it is a row that can never be interpreted again.
     */
    @ManyToOne(() => ClassSession, (classSession) => classSession.attendances, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'class_session_id' })
    classSession: ClassSession;

    /**
     * The group the child sat with — which is `classSession.group`, and therefore the one piece of
     * duplication left on this row.
     *
     * It stays for now because it is on the wire (`Attendance.group` in `@itbridge/types`) and it
     * is what the read path selects on: `getAttendanceByChild` loads `group.room.location` to
     * filter the admin list by location. `date` and `startTime` had neither excuse — they were
     * half of the old uniqueness key, so a row could claim a class started at 09:00 while the
     * class said 16:00 and nothing anywhere would notice. Those are gone; this one is the next to
     * go, once reads go through the session.
     */
    @ManyToOne(() => Group, { nullable: false })
    group: Group;

    /**
     * A real enum column now. It used to be a varchar defaulting to `'normal'` — a value the
     * service never writes and the frontend cannot render, so any row inserted outside
     * `createAttendance` showed up with an empty session type. The database refuses it now.
     */
    @Column({ type: 'enum', enum: AttendanceType, default: AttendanceType.REGULAR })
    type: AttendanceType;

    @Column({ type: 'boolean', default: false })
    present: boolean;
}
