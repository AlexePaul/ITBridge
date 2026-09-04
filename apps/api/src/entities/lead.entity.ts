import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Child } from './child.entity';
import { ClassSession } from './class-session.entity';
import { Enrollment } from './enrollment.entity';
import { Group } from './group.entity';
import { Location } from './location.entity';
import { Profile } from './profile.entity';
import { User } from './user.entity';
import { LeadChannel, LeadSource } from '../enum/lead-source.enum';
import { LeadStatus } from '../enum/lead-status.enum';

/**
 * One family that asked — E20/S1.
 *
 * Before this table the funnel ended in a mailbox: nobody could say how many asked, which went
 * unanswered, or which became an enrolment. A lead is the row that outlives the inbox.
 *
 * **It carries its own copy of the contact details, and that is deliberate.** A booking made on the
 * public form does create a `Profile` and a `Child` — a seat cannot be held by a row with no child
 * in it, and the trial has to appear in the group's register — but that profile is a shell: no
 * account, and **no email or phone**. Those two columns on `Profile` are unique, so writing a
 * stranger's address into them from a public form would either collide with a real family or, worse,
 * attach a child to one. The family's own details stay here until an admin, enrolling in E11, puts
 * them on the profile deliberately.
 *
 * The child's details are copied here too, for the same reason in reverse: a lead that found no seat
 * has no child row at all, and "how old were the children we turned away" is precisely what S4 asks.
 */
@Entity('leads')
// The screens are "what is open" and "trials held, no decision", so status is what everything filters
// on first.
@Index('IDX_leads_status', ['status'])
export class Lead {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @Column({ type: 'enum', enum: LeadStatus, default: LeadStatus.NEW })
    status: LeadStatus;

    @Column({ type: 'enum', enum: LeadSource })
    source: LeadSource;

    @Column({ type: 'enum', enum: LeadChannel, nullable: true })
    channel: LeadChannel | null;

    // ---- who asked -------------------------------------------------------------------------

    @Column({ type: 'varchar', length: 160 })
    parentName: string;

    /** Not unique, unlike `Profile.email`: two enquiries from the same address are two enquiries. */
    @Column({ type: 'varchar', length: 255, nullable: true })
    parentEmail: string | null;

    @Column({ type: 'varchar', length: 30, nullable: true })
    parentPhone: string | null;

    @Column({ type: 'varchar', length: 100 })
    childFirstName: string;

    @Column({ type: 'varchar', length: 100 })
    childLastName: string;

    @Column({ type: 'date' })
    childBirthDate: Date;

    /** "A făcut Scratch la școală", "n-a atins niciodată un calculator". Free text, as asked. */
    @Column({ type: 'text', nullable: true })
    experience: string | null;

    // ---- what they asked for ---------------------------------------------------------------

    @ManyToOne(() => Location, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'location_id' })
    location: Location | null;

    @ManyToOne(() => Group, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'group_id' })
    group: Group | null;

    /**
     * The class the trial was booked into. Null for a lead that never got one.
     *
     * A session rather than a date and an hour, like everything else in this codebase that talks
     * about a class: an absence notice, a make-up credit and this all hang off the same row, so a
     * class that moves takes them with it.
     */
    @ManyToOne(() => ClassSession, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'class_session_id' })
    trialSession: ClassSession | null;

    /**
     * Nobody had a seat for them — E20/S2 and S4.
     *
     * Set when the form found no compatible group with room, or when the seat went between the page
     * loading and the button being pressed. It is the only measure of demand the school cannot
     * serve: a parent who finds no free hour never enters a conversion rate, because they never
     * entered the funnel.
     */
    @Column({ type: 'boolean', default: false })
    noSeats: boolean;

    // ---- what became of them ---------------------------------------------------------------

    @ManyToOne(() => Profile, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'profile_id' })
    profile: Profile | null;

    @ManyToOne(() => Child, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'child_id' })
    child: Child | null;

    /** The trial enrolment holding the seat. Its resolution in E11 is what settles this lead. */
    @ManyToOne(() => Enrollment, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'enrollment_id' })
    enrollment: Enrollment | null;

    @Column({ type: 'varchar', length: 255, nullable: true })
    lostReason: string | null;

    // ---- who is on it ----------------------------------------------------------------------

    /**
     * The person who answers for this family.
     *
     * Nullable, and the acceptance ("none is left without an owner") is met by making an unowned
     * lead **loud** rather than by pretending: there is no staff model yet (E09 is out of MVP) and
     * everyone who signs in is an admin, so auto-assigning to whoever happens to be first in the
     * table would put a name on a row nobody had agreed to. Unassigned leads head the follow-up
     * screen and are named in the daily reminder; claiming one is a single click.
     */
    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'assigned_to_id' })
    assignedTo: User | null;

    @Column({ type: 'text', nullable: true })
    notes: string | null;

    /** The next step, with a date on it — "sună în martie", from S3. */
    @Column({ type: 'date', nullable: true })
    nextActionAt: Date | null;

    // ---- when things happened --------------------------------------------------------------

    /**
     * The last time a **person** did something about this lead.
     *
     * Distinct from `updatedAt` on purpose: the reminder job writes nothing here, so a lead cannot
     * quietly refresh its own idleness by being reminded about. S3's "no lead sits seven days
     * without action" is measured from this column, and it moves only for human acts — a status
     * change, a note, an assignment, the booking itself.
     */
    @Column({ type: 'timestamptz' })
    lastActivityAt: Date;

    /** When the child actually attended. Frozen at the moment the register said so. */
    @Column({ type: 'timestamptz', nullable: true })
    trialHeldAt: Date | null;

    /**
     * When somebody finally said yes or no. With `trialHeldAt` this is the second number S4 needs:
     * a falling trial→enrolment rate means either the class disappointed or nobody followed up, and
     * only the gap between these two columns tells the difference.
     */
    @Column({ type: 'timestamptz', nullable: true })
    decidedAt: Date | null;

    /**
     * What makes a double-pressed public form one lead instead of two — the same shape as
     * `Announcement.dedupeKey`, and here for a sharper reason: a second press does not just send a
     * second email, it creates a second child and takes a second seat out of a room of ten.
     *
     * Null for leads an admin types in, which is why the unique index is partial.
     */
    @Column({ type: 'varchar', length: 64, nullable: true, unique: true })
    bookingKey: string | null;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt: Date;
}
