import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ProjectVersion } from './project-version.entity';

/**
 * One stored file. E14/S1.
 *
 * **There is no `storageKey` column.** The key is `projects/{projectId}/{versionId}/{fileId}`,
 * derived by `projectFileKey`, exactly as an invoice's PDF key is derived rather than stored. Two
 * places that can each say where an object lives will eventually disagree, and the disagreement is
 * silent — the object is simply not found. Identifiers only, never a child's name: the invoice
 * module already paid that lesson, where the parent's name in the key made every invoice they had
 * ever received unreachable at the first rename, and here it would also leak the name into signed
 * URLs and logs.
 */
@Entity('project_files')
export class ProjectFile {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @ManyToOne(() => ProjectVersion, (version) => version.files, { nullable: false, onDelete: 'CASCADE' })
    @JoinColumn({ name: 'version_id' })
    version: ProjectVersion;

    /** What the teacher saved it as. Shown on screen and used as the download name, never as a key. */
    @Column({ type: 'varchar', length: 255 })
    originalName: string;

    /**
     * The type the bytes actually are, read from the file's magic numbers.
     *
     * Not from the extension: an extension is a claim made by whoever named the file, and the share
     * is writable from any machine in the school. Storing the claim would mean serving it back as
     * `Content-Type` later, which is the one place a wrong answer has consequences.
     */
    @Column({ type: 'varchar', length: 120 })
    contentType: string;

    @Column({ type: 'bigint', transformer: { to: (v: number) => v, from: (v: string) => Number(v) } })
    sizeBytes: number;

    /**
     * The idempotency key, `{childId}:{sha256 of the bytes}` — derived from content, never from the
     * name. Unique, so a repeated upload is refused by the database rather than by a check that
     * races two agent passes against each other.
     *
     * The failure this prevents is documented in E04 and was reproduced: an upload that died
     * halfway left a row behind, the retry hit a unique constraint, and the whole thing wedged.
     * Here the same retry would produce a *second* `Project` and, at send time, a second thumbnail
     * in the parent's email. Keying on the name instead would defeat it entirely — a teacher saving
     * `proiect.sb3` twice in two weeks means two different files.
     */
    @Index('IDX_project_files_ingestion_key', { unique: true })
    @Column({ type: 'varchar', length: 120 })
    ingestionKey: string;

    /**
     * When the bytes were confirmed to be in the bucket. Null while an upload is still expected.
     *
     * Large files — video, above all — are uploaded straight to S3 through a signed URL and never
     * pass through this process, so the row exists before the object does. `uploadFile` holds the
     * whole file in memory and the API shares an instance with Postgres: a buffered 200MB upload is
     * not slow, it is fatal. A file still waiting for its bytes is not shown to a parent and does
     * not let its project be sent.
     */
    @Column({ type: 'timestamptz', nullable: true })
    uploadedAt: Date | null;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;
}
