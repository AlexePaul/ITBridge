import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { AuditAction } from '../enum/audit-action.enum';

/**
 * What one side of a change can be, once it is in the column.
 *
 * Scalars only, and deliberately so: `jsonb` holds JSON, and a type that admitted `unknown` would
 * let a `Date`, an entity or a whole relation reach the column — where the first reads as an
 * unhelpful timestamp format, and the last quietly turns the trail into a second copy of a family's
 * data. `diffFields` narrows to this before storing.
 */
export type AuditValue = string | number | boolean | null;

/** `{ amount: { from: 350, to: 150 } }` — only the fields that actually moved. */
export type AuditChanges = Record<string, { from: AuditValue; to: AuditValue }>;

/**
 * Who changed what, and when — E07 S3.
 *
 * The story's acceptance is one question: "cine a schimbat suma facturii 412 și când", answerable
 * in under a minute. That is what shapes the columns — `entityType` plus `entityId` are indexed
 * together, so the answer is one lookup rather than a scan of everything that happened.
 *
 * **The actor is denormalised on purpose.** There is no relation to `User`, and `actorUsername` is
 * copied in at write time rather than joined at read time. An audit trail whose rows point at a
 * table somebody can delete from is an audit trail that loses exactly the entries that matter: the
 * ones about an account that was later removed. The id is kept beside the name for the cases where
 * the account still exists and you want to find it.
 *
 * **`changes` holds only what moved.** A before-and-after of the whole row would make every entry a
 * copy of a family's data, which is more personal data stored for longer, not less — and E07 is the
 * epic that exists to reduce that. So a payment whose amount was corrected stores the amount, not
 * the parent's address.
 *
 * **Nothing updates or deletes a row here.** There is no service method for it and no endpoint; the
 * only writer is `AuditService.record`. Retention is deliberately not decided here — the number
 * lives in E22 S3, with the promise made to the family, and the job that applies it is E04 S5.
 */
@Entity('audit_log')
@Index('IDX_audit_log_entity', ['entityType', 'entityId'])
@Index('IDX_audit_log_occurred_at', ['occurredAt'])
export class AuditLog {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @CreateDateColumn({ type: 'timestamptz', name: 'occurred_at' })
    occurredAt: Date;

    /**
     * The signed-in user who acted. Null only where no human did — a scheduled job correcting an
     * invoice's status, for instance — and a null actor is a fact worth being able to read, not a
     * gap to fill with a placeholder.
     */
    @Column({ type: 'int', name: 'actor_user_id', nullable: true })
    actorUserId: number | null;

    /** Copied at write time; see the note above on why this is not a join. */
    @Column({ type: 'varchar', length: 100, name: 'actor_username', nullable: true })
    actorUsername: string | null;

    @Column({ type: 'enum', enum: AuditAction })
    action: AuditAction;

    /** The entity's class name as the application knows it: `Payment`, `Invoice`, `Discount`. */
    @Column({ type: 'varchar', length: 60, name: 'entity_type' })
    entityType: string;

    @Column({ type: 'int', name: 'entity_id' })
    entityId: number;

    /**
     * `{ amount: { from: 350, to: 150 } }` — only the fields that actually moved.
     *
     * `jsonb` rather than `json`: it is the type that can be indexed and queried later if a
     * question ever needs it, and it normalises whitespace so two identical entries compare equal.
     *
     * **No database default**, on purpose. `AuditService.record` is the only writer and always
     * supplies a value, so a `DEFAULT '{}'::jsonb` would buy nothing — and TypeORM cannot compare a
     * function default with what Postgres reports, so `check:schema` would call drift on every run
     * and emit a `DROP DEFAULT` followed by an identical `SET DEFAULT`. Same reason `publicId` is
     * generated in the entity rather than by `gen_random_uuid()`: a guard that fails on every PR
     * stops being read.
     */
    @Column({ type: 'jsonb' })
    changes: AuditChanges;

    /**
     * Free text for the cases where the change alone does not explain itself — the reason typed
     * into a session-count override, for example. Never a place for personal data.
     */
    @Column({ type: 'varchar', length: 500, nullable: true })
    note: string | null;
}
