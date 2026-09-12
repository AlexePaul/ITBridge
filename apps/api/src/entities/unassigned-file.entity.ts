import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Group } from './group.entity';
import { UnassignedFileReason } from '../enum/unassigned-file-reason.enum';

/**
 * A file the agent could not place, and moved to `_neatribuite`. E14/S2.
 *
 * It is a row because the alternative is silence. A file saved into the group folder instead of a
 * child's, or exported in a format the whitelist does not carry, is *information* — the same
 * discipline E17/S5 applies to a parent with no address, where the missing delivery is a line in
 * the report rather than a line skipped.
 *
 * Nothing is deleted from the share: the file stays where the agent moved it, and this row is the
 * task that says so. Resolving it is an admin action, not a rule — the file may have been moved
 * into the right folder, or it may simply not have been anybody's work.
 */
@Entity('unassigned_files')
@Index('IDX_unassigned_files_group_id', ['group'])
// One *open* report per place, not one ever. A plain unique key here would have been a promise that
// a file which turned up in the group folder in September can never turn up there again — and the
// commonest of these is a teacher's habit, so it turns up again in October. The second time, the
// insert was ignored, the agent moved the file to `_neatribuite` exactly as before, and nothing
// anywhere said so: the file left the folder in silence, which is the one thing E14/S2 promises it
// will not do. Partial, so history accumulates: the same idiom as `UQ_enrollments_one_in_force`.
@Index('UQ_unassigned_files_one_open_per_path', ['reportKey'], { unique: true, where: '"resolvedAt" IS NULL' })
export class UnassignedFile {
    @PrimaryGeneratedColumn('increment')
    id: number;

    /**
     * The group whose folder it turned up in. Nullable, because a file dropped at the root of the
     * share belongs to no group — and that is precisely the case worth seeing.
     */
    @ManyToOne(() => Group, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'group_id' })
    group: Group | null;

    /** Where it sat, relative to the watched root. Enough for an admin to walk over and look. */
    @Column({ type: 'varchar', length: 1024 })
    relativePath: string;

    @Column({ type: 'varchar', length: 255 })
    fileName: string;

    @Column({ type: 'bigint', default: 0, transformer: { to: (v: number) => v, from: (v: string) => Number(v) } })
    sizeBytes: number;

    @Column({ type: 'enum', enum: UnassignedFileReason })
    reason: UnassignedFileReason;

    /**
     * Idempotency for a service that rescans. `{groupId|root}:{relativePath}`, unique **among the
     * rows nobody has dealt with yet** — see the index above the class. An agent restarted three
     * times in an afternoon reports the same stray file once; the same file next term is a second
     * report, because it is a second thing that happened. The same mechanism as the outbox's
     * `dedupeKey`, for the same reason: a check-then-insert races with the next pass.
     */
    @Column({ type: 'varchar', length: 1100 })
    reportKey: string;

    @CreateDateColumn({ type: 'timestamptz' })
    reportedAt: Date;

    /** Set when an admin has dealt with it. The row stays: it is a record, not a to-do item. */
    @Column({ type: 'timestamptz', nullable: true })
    resolvedAt: Date | null;
}
