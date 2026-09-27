import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { ErrorSource } from '../enum/error-source.enum';

/**
 * One time an error happened: when, the reference shown on the screen that hit it, and who.
 *
 * `ref` is what a person can read out over the phone: the request id for a request (the screen shows
 * its first eight characters), the reference the browser made up for a screen that broke, nothing for
 * work nobody asked for. `userId` is a pointer, not a relation — see the entity.
 */
export interface ErrorOccurrence {
    at: string;
    ref: string | null;
    userId: number | null;
    path: string | null;
}

/**
 * Something that broke, once per distinct fault — E06 S1, the part of it this school needs.
 *
 * The epic was taken out of the MVP with the sentence "o excepție în producție se află de la
 * părintele care sună". That stops being acceptable the week families use the platform: the stack
 * trace of a 500 sat in `pm2 logs` on an instance only reachable through SSM, so the person who
 * could fix the bug was the one person who could not see it. This table is the logs' answer to the
 * one question that matters for a fix — what broke, where, how often, and for whom — on a screen.
 *
 * **One row per fault, not per occurrence.** The fingerprint is the kind of error and where it
 * happened, with the ids and numbers taken out of the message, so a bug hit by thirty families is one
 * row with `occurrences = 30`, not thirty rows burying the next bug. The last twenty occurrences are
 * kept on the row (`recent`), which is what answers "whose screen", and the reference a family reads
 * out from theirs finds the row.
 *
 * **Unique among the open rows only**, as `UQ_unassigned_files_one_open_per_path`: resolving a row
 * says "fixed", and the same fault coming back after that is news — a second row, not a counter that
 * went up on a closed one.
 *
 * **What goes in is scrubbed first** (`error-report.rules.ts`): addresses, phone numbers, IBANs,
 * tokens and the values Postgres quotes in a constraint error. The row outlives nothing — it goes
 * after `ERROR_REPORT_RETENTION_DAYS`, like the server's own logs (privacy note §3.9 and §7).
 */
@Entity('error_reports')
@Index('UQ_error_reports_one_open_per_fingerprint', ['fingerprint'], { unique: true, where: '"resolvedAt" IS NULL' })
@Index('IDX_error_reports_last_seen_at', ['lastSeenAt'])
export class ErrorReport {
    @PrimaryGeneratedColumn('increment')
    id: number;

    /** SHA-256 of what makes two occurrences the same fault. Hex, so 64 characters. */
    @Column({ type: 'varchar', length: 64 })
    fingerprint: string;

    @Column({ type: 'enum', enum: ErrorSource })
    source: ErrorSource;

    /**
     * Where: `GET /invoices/:id` for a request (the route, not the address, so the ids do not split a
     * fault into one row per family), the logger's context for work in the background, the page and
     * the component for a browser.
     */
    @Column({ type: 'varchar', length: 300 })
    origin: string;

    @Column({ type: 'varchar', length: 100 })
    errorName: string;

    /** The latest occurrence's message, scrubbed. */
    @Column({ type: 'varchar', length: 1000 })
    message: string;

    /** The latest stack trace, scrubbed. Source-mapped on the server, so the lines are the `.ts` ones. */
    @Column({ type: 'text', nullable: true })
    stack: string | null;

    /** What the response said, for a request: 500, 503. */
    @Column({ type: 'int', nullable: true })
    statusCode: number | null;

    /** The error code the response carried (`INTERNAL_ERROR`, `DATABASE_ERROR`), or how a browser caught it. */
    @Column({ type: 'varchar', length: 100, nullable: true })
    code: string | null;

    @Column({ type: 'int', default: 1 })
    occurrences: number;

    @Column({ type: 'timestamptz' })
    firstSeenAt: Date;

    @Column({ type: 'timestamptz' })
    lastSeenAt: Date;

    /**
     * The last twenty occurrences, newest first.
     *
     * **No database default**, on purpose, as `audit_log.changes`: the only writer always supplies a
     * value, and TypeORM cannot compare a function default with what Postgres reports, so
     * `check:schema` would call drift on every run.
     */
    @Column({ type: 'jsonb' })
    recent: ErrorOccurrence[];

    /** Set when an admin marked it fixed. The row stays until its term: it is a record, not a to-do. */
    @Column({ type: 'timestamptz', nullable: true })
    resolvedAt: Date | null;
}
