import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Child } from './child.entity';
import { Group } from './group.entity';
import { EnrollmentStatus } from '../enum/enrollment-status.enum';

/**
 * One period of a child's participation in one group — E11/S1.
 *
 * Before this, "the child is in a group" was a single foreign key on `Child`. You could not answer
 * "which group was this child in last October", which is exactly the question that comes up when a
 * family disputes an invoice, and a transfer silently erased where they had been.
 *
 * **A child has at most one enrolment in force at a time** — D6, the school's rule about children
 * rather than about software: two trips a week is too much at this age. `TRIAL` counts as in force,
 * so a child with a trial booked cannot get a second one in another group. The rule is enforced in
 * two places on purpose: `UQ_enrollments_one_in_force` makes it impossible, and `EnrollmentService`
 * checks first so the refusal reaches the client as a 409 with a reason rather than as a driver
 * error.
 *
 * **`Child.group` stays, as a derived column.** S1 allows it, and it is what keeps the blast radius
 * of this change sane: six queries read it today, two of them security-relevant — the parent's
 * timetable scoping and who may be marked present. It is written **only** by `EnrollmentService`,
 * in the same transaction as the row that justifies it, and an integration test asserts the two
 * agree after every operation.
 *
 * There is no module column. E10 is out of scope, so a `module` here would be a column nothing
 * writes and nothing reads — it comes back the day a catalogue does.
 */
@Entity('enrollments')
// A partial unique index rather than a plain one: history is meant to accumulate, so several closed
// rows per child are normal and only the in-force ones must be unique. Postgres enforces this even
// against two concurrent admins, which no amount of checking in the service can.
@Index('UQ_enrollments_one_in_force', ['child'], { unique: true, where: `status IN ('TRIAL', 'ACTIVE')` })
export class Enrollment {
    @PrimaryGeneratedColumn('increment')
    id: number;

    // CASCADE: the history exists to describe the child, so deleting the child takes it along.
    // `Child` itself is deletable today, and leaving orphan enrolment rows behind would be a slow
    // leak of exactly the personal data E07 wants gone.
    @ManyToOne(() => Child, { onDelete: 'CASCADE', nullable: false })
    @JoinColumn({ name: 'child_id' })
    child: Child;

    // RESTRICT, unlike the child: a group with history behind it must not vanish and take the
    // answer to "who was in it" with it. The service refuses first, with an explanation.
    @ManyToOne(() => Group, { onDelete: 'RESTRICT', nullable: false })
    @JoinColumn({ name: 'group_id' })
    group: Group;

    @Index()
    @Column({ type: 'enum', enum: EnrollmentStatus })
    status: EnrollmentStatus;

    /** The day participation began. A `date`, not a timestamp: nobody enrols at 14:32. */
    @Column({ type: 'date' })
    startDate: string;

    /** Set when the row stops being in force. `null` for exactly the rows that still are. */
    @Column({ type: 'date', nullable: true })
    endDate: string | null;

    /** Why it ended, in the admin's words. Empty for a row still in force. */
    @Column({ type: 'varchar', length: 500, nullable: true })
    exitReason: string | null;

    /**
     * When the paper enrolment contract was signed — E11/D3, and E07/S8 owns the rule.
     *
     * The platform stores the fact and the date, and nothing else: no text, no versioning, no
     * digital acceptance. Since an admin is in the room for every enrolment (D2), the signature on
     * paper is as easy to obtain as a checkbox would be, and the checkbox would have dragged in
     * versioning the text, proving acceptance, and deciding what happens to families who signed the
     * old version.
     */
    @Column({ type: 'date', nullable: true })
    contractSignedAt: string | null;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;
}
