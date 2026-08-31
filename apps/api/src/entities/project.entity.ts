import { BeforeInsert, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { randomUUID } from 'crypto';
import { Child } from './child.entity';
import { ClassSession } from './class-session.entity';
import { User } from './user.entity';
import { ProjectVersion } from './project-version.entity';
import { ProjectLink } from './project-link.entity';
import { ProjectStatus } from '../enum/project-status.enum';
import { ProjectSource } from '../enum/project-source.enum';

/**
 * One piece of work by one child. E14/S1.
 *
 * **A project has files, links, or both.** Requiring a file would exclude the youngest groups
 * outright: the catalogue in `apps/web/shared/courses.ts` puts Tinkercad and Canva at 1st–2nd grade
 * and web pages at 5th–6th, and for those the child's work *is* the link. Neither relation is
 * mandatory in the schema — the service refuses a project with nothing in it, because "at least one
 * of two collections is non-empty" is not a constraint a column can carry.
 *
 * **No module and no lesson**, the same absence as on `ClassSession` and for the same reason: E10
 * is out of MVP. When it lands, two nullable relations attach here and the "ce s-a învățat" line in
 * the parent's email stops being blank.
 *
 * **Nothing here says `isPublic`.** The showcase in E14/S6 publishes a child's work under their
 * first name and age, which needs the consent record from E07/S2 — `(Profile, Child, purpose)`,
 * revocable, and the single source of truth. A boolean on this row would be a second place the same
 * question could be answered, with no precedence between them, and a revocation would leave rows
 * behind still saying yes. So the column is not here, and the showcase waits for the record that
 * governs it.
 */
@Entity('projects')
// The group screen asks for "everything for these children, newest first" and the parent portal for
// "everything of mine that has been sent". Both start from the child.
@Index('IDX_projects_child_captured', ['child', 'capturedOn'])
export class Project {
    @PrimaryGeneratedColumn('increment')
    id: number;

    /**
     * The identifier a parent's link carries: `itbridgeschool.com/files/<uuid>`.
     *
     * Random, and never the child's name — a mailed link is forwarded, screenshotted and pasted
     * into group chats. The endpoint behind it still checks that the child belongs to whoever is
     * asking, so this is not the security boundary; it is what keeps the boundary from being
     * probed one integer at a time.
     *
     * Filled in by the hook below rather than by a `DEFAULT gen_random_uuid()` on the column.
     * Postgres would do it perfectly well — the function has been in core since 13 — but TypeORM
     * cannot compare a function default against what the database reports, so `check:schema` would
     * declare drift on every run, emitting a DROP DEFAULT followed by the identical SET DEFAULT. A
     * guard that fails on every pull request stops being read.
     */
    @Column({ type: 'uuid', unique: true })
    publicId: string;

    /**
     * Whose work it is. CASCADE: a child removed from the system takes their work with them, which
     * is also what E07/S4's erasure will need.
     */
    @ManyToOne(() => Child, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'child_id' })
    child: Child;

    /**
     * The class it was made in, when one can be worked out from the date and the child's group.
     *
     * Nullable, and deliberately so: a project added by hand in January for work done in December
     * has no session to point at, and the timetable is only generated eight weeks ahead. SET NULL
     * rather than CASCADE — a cancelled class that gets deleted must not delete a child's work.
     *
     * **Attendance is not derived from this, in either direction.** A file in a folder proves
     * somebody saved a file, not that a child sat in a chair, and the share is writable from any
     * machine in the school at any hour. The useful direction is the other one, and it is a read:
     * the group screen can show which of today's present children have nothing yet.
     */
    @ManyToOne(() => ClassSession, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'class_session_id' })
    classSession: ClassSession | null;

    /** What an admin or a parent reads first. Defaulted from the file name when the agent uploads. */
    @Column({ type: 'varchar', length: 200 })
    title: string;

    @Column({ type: 'text', nullable: true })
    description: string | null;

    /**
     * The day the work was done — from the folder the agent found it in, or typed by an admin — not
     * the day the row was written. The two differ whenever the office computer was off overnight.
     */
    @Column({ type: 'date' })
    capturedOn: Date;

    @Column({ type: 'enum', enum: ProjectStatus, default: ProjectStatus.NEW })
    status: ProjectStatus;

    @Column({ type: 'enum', enum: ProjectSource, default: ProjectSource.AGENT })
    source: ProjectSource;

    /**
     * Who uploaded it. The agent has a `User` of its own with the `ADMIN` role, because no other
     * role exists — E09's teacher role is deliberately not being built — so this column is the only
     * thing that distinguishes its uploads from a person's.
     *
     * SET NULL: the account may be retired later, and the work stays.
     */
    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'uploaded_by_user_id' })
    uploadedBy: User | null;

    /**
     * Whether a thumbnail was produced, at `projects/{id}/thumb.jpg`.
     *
     * A flag rather than a stored key: the key is derived by `projectThumbnailKey`, so there is one
     * definition of where it lives instead of a column that can disagree with it. Thumbnailing is
     * allowed to fail — a project without one is far better than a project that did not upload —
     * and this is how the interface knows which happened.
     */
    @Column({ type: 'boolean', default: false })
    hasThumbnail: boolean;

    /** When the emails were queued. Set by the send, together with `sentToEmail`. */
    @Column({ type: 'timestamptz', nullable: true })
    sentAt: Date | null;

    /**
     * The address it was addressed to, copied at send time.
     *
     * A copy, not a join to the profile: E14/S7 has to answer "did the email go, and to whom?" for
     * a document that turned out to belong to another child, and reading the address through the
     * profile would answer with wherever that parent's address is *today*.
     */
    @Column({ type: 'varchar', length: 255, nullable: true })
    sentToEmail: string | null;

    /**
     * The outbox row that carried it, as a plain number rather than a foreign key.
     *
     * The queue is not a domain table and E17/S5 will own the delivery record properly; a real
     * constraint from here into it would make the queue undeletable and imply a relation neither
     * side wants. Enough to find the row and read what the provider said.
     */
    @Column({ type: 'int', nullable: true })
    sentOutboxMessageId: number | null;

    /**
     * The trail left by a correction. E14/S7.
     *
     * Three columns rather than an entry in an audit log, because the audit log is E07/S3 and does
     * not exist. Losing "moved away from whom" would make a misdelivery untraceable, which is the
     * whole point of recording it — a file saved into the wrong child's folder and sent is a
     * disclosure of personal data, not an embarrassment. When E07/S3 lands, this moves there.
     */
    @Column({ type: 'timestamptz', nullable: true })
    reassignedAt: Date | null;

    @Column({ type: 'int', nullable: true })
    reassignedFromChildId: number | null;

    @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'reassigned_by_user_id' })
    reassignedBy: User | null;

    @OneToMany(() => ProjectVersion, (version) => version.project, { cascade: false })
    versions: ProjectVersion[];

    @OneToMany(() => ProjectLink, (link) => link.project, { cascade: false })
    links: ProjectLink[];

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;

    /**
     * Every project is created through `save`, so this always runs. `??=` rather than a plain
     * assignment because re-saving an existing row must not mint a new identifier and break every
     * link already sitting in a parent's inbox.
     *
     * The one thing that would bypass it is an insert through the query builder. Nothing creates a
     * project that way — `ON CONFLICT DO NOTHING` is needed on `project_files`, whose uniqueness is
     * what makes ingestion idempotent, and not here.
     */
    @BeforeInsert()
    assignPublicId(): void {
        this.publicId ??= randomUUID();
    }
}
