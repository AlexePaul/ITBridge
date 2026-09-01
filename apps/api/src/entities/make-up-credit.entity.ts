import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Child } from './child.entity';
import { ClassSession } from './class-session.entity';
import { Attendance } from './attendance.entity';

/**
 * The right to sit in on another group's class, earned by missing your own — E12/S4.
 *
 * Earned, not granted: a credit exists only where an announced-in-time absence (S3) meets a register
 * that says the child was not there. Neither half alone is enough — a family that announced and then
 * turned up was present, and a child absent without a word did not announce anything — and that
 * intersection is the whole of what "absență eligibilă" means.
 */
@Entity('make_up_credits')
// One credit per missed class. The absence is the thing that earns it, and an absence happens once.
@Index('UQ_make_up_credit_origin', ['originSession', 'child'], { unique: true })
export class MakeUpCredit {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @ManyToOne(() => Child, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'child_id' })
    child: Child;

    /** The class that was missed. What the credit is *for*, and what dates its window. */
    @ManyToOne(() => ClassSession, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'origin_session_id' })
    originSession: ClassSession;

    /**
     * The last day it can be used, inclusive — stored, not computed on read.
     *
     * Frozen for the same reason `AbsenceNotice.inTime` is: the window a family was told about must
     * not move when somebody edits the rule. `makeUpExpiryFor` is what sets it, once.
     */
    @Column({ type: 'date' })
    expiresOn: Date;

    /** The class booked to sit in on, once a parent has chosen one. */
    @ManyToOne(() => ClassSession, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'booked_session_id' })
    bookedSession: ClassSession | null;

    /**
     * The mark that spent it. Its presence *is* the consumed state — there is no status column,
     * because a second place to say "spent" is a second place to disagree about it.
     */
    @ManyToOne(() => Attendance, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'consumed_attendance_id' })
    consumedAttendance: Attendance | null;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;
}
