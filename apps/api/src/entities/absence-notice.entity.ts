import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Child } from './child.entity';
import { ClassSession } from './class-session.entity';
import { User } from './user.entity';

/**
 * A parent saying, in advance, that their child will not be at one class — E12/S3.
 *
 * Attached to the **session**, not to a date, for the same reason attendance is: the class is a row,
 * and describing it by date and hour was how the register used to disagree with the timetable.
 *
 * Announcing does not mark anybody absent. The register is still the teacher's to take — a child
 * whose parent announced can turn up anyway, and children do. This row is what the teacher sees
 * *before* the class, and what decides whether the absence earns a make-up.
 */
@Entity('absence_notices')
// One notice per child per class. A parent who announces twice has changed their mind, not created
// a second absence; the service updates the row rather than adding one, and the index is what makes
// that true for two taps in the same second.
@Index('UQ_absence_notice_child_session', ['child', 'classSession'], { unique: true })
export class AbsenceNotice {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @ManyToOne(() => Child, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'child_id' })
    child: Child;

    /** CASCADE: a notice about a class that no longer exists cannot be read as anything. */
    @ManyToOne(() => ClassSession, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'class_session_id' })
    classSession: ClassSession;

    /** Free text, required. „De ce" is what makes the notice worth more to the school than silence. */
    @Column({ type: 'varchar', length: 500 })
    reason: string;

    /**
     * Whether the notice arrived in time to count — decided **when it is written**, never
     * recomputed.
     *
     * Frozen on purpose: eligibility is a fact about the moment the parent announced, and a column
     * derived on read would change its answer as the class receded into the past. The rule that set
     * it lives in `absence-notice.rules.ts`; changing that rule must not silently rewrite what
     * families were already told.
     */
    @Column({ type: 'boolean' })
    inTime: boolean;

    /** Who announced it. A parent for their own child; an admin who took the phone call. */
    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'announced_by_id' })
    announcedBy: User | null;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;
}
