import { Column, Entity, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { Child } from './child.entity';
import { Group } from './group.entity';
import { AttendanceType } from '../enum/attendance-type.enum';

@Entity('attendances')
@Unique(['child', 'date', 'startTime'])
export class Attendance {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @ManyToOne(() => Child, (child) => child.attendances, { onDelete: 'CASCADE' })
    child: Child;

    @ManyToOne(() => Group, { nullable: false })
    group: Group;

    @Column({ type: 'date' })
    date: Date;

    @Column({ type: 'time' })
    startTime: string;

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
