import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { OutboxStatus } from '../enum/outbox-status.enum';

/**
 * One email waiting to be sent. The transactional outbox from E17/S3.
 *
 * The point of the table is the word *transactional*: the row is written in the same transaction
 * as the thing that caused it, so the invoice and its notification are saved together or lost
 * together. Sending inside the request would mean a provider outage failing an invoice, and
 * sending after the commit would mean an invoice nobody was ever told about, with no record that
 * anyone was supposed to be.
 *
 * The class is `OutboxMessage`, not `Outbox`: one row is one message, and `Outbox` would read like
 * the queue itself. The table keeps the name E17 gives it.
 *
 * **The scheduler that drains this runs in a single instance.** Nothing here enforces that —
 * `SELECT … FOR UPDATE SKIP LOCKED` makes two concurrent passes safe against each other, but two
 * PM2 cluster workers would both wake up on the same cron tick and both hammer the provider. The
 * single-instance pin belongs in the PM2 ecosystem file from E01/S4, **which does not exist yet**.
 * Until it does, this queue can be built and tested but has nowhere to run continuously — the
 * backend is not deployed at all today.
 */
@Entity('outbox')
// The claim query is `WHERE status = 'pending' AND nextAttemptAt <= now() ORDER BY nextAttemptAt`.
// Without the index that is a sequential scan under a row lock, which is the one place a table
// like this can go wrong quietly as it fills with sent rows nobody deletes.
@Index('IDX_outbox_claim', ['status', 'nextAttemptAt'])
export class OutboxMessage {
    @PrimaryGeneratedColumn('increment')
    id: number;

    /** A single address. E17 is explicit that a message about a child has exactly one recipient. */
    @Column({ type: 'varchar', length: 255 })
    to: string;

    @Column({ type: 'varchar', length: 255 })
    subject: string;

    /**
     * The rendered body, not a template name plus its data.
     *
     * E17/S3 describes the row as holding "șablon, datele de interpolat" — but templates are S2 of
     * that epic and are not built. Storing a template id now would mean storing the name of
     * something that does not exist, and it has a real drawback even once it does: a template
     * edited between queueing and sending changes a message that was already approved. What is
     * queued here is what goes out.
     */
    @Column({ type: 'text' })
    bodyText: string;

    /**
     * Optional HTML alternative. Resend takes `text`, `html`, or both. The daily unmarked-
     * attendance reminder from E12 is a short list and sends text only; the column is here so that
     * E17/S2's templates, which promise both variants, do not need a migration to land.
     */
    @Column({ type: 'text', nullable: true })
    bodyHtml: string | null;

    @Column({ type: 'enum', enum: OutboxStatus, default: OutboxStatus.PENDING })
    status: OutboxStatus;

    /** How many times the provider has been asked. Compared against the configured limit. */
    @Column({ type: 'int', default: 0 })
    attempts: number;

    /**
     * Not before this instant. The whole backoff lives in this one column: a failed attempt sets
     * it further out, and the claim query simply refuses to see the row until then. A backoff
     * computed from `attempts` and `createdAt` instead would have to be recomputed identically
     * everywhere, and could not be nudged by hand to retry one stuck message now.
     */
    @Column({ type: 'timestamptz', default: () => 'now()' })
    nextAttemptAt: Date;

    /**
     * Why the last attempt failed. Kept on the row rather than only in a log, because E17/S5 has
     * to answer "did the parent get the cancellation notice?" from the interface, and "no, and
     * here is what the provider said" is the answer that resolves it.
     */
    @Column({ type: 'text', nullable: true })
    lastError: string | null;

    /**
     * Idempotency key, chosen by whoever queues the message. Unique, so a second attempt to queue
     * the same logical message is rejected by the database rather than by a check that races.
     *
     * This is what makes E12's daily job safe to re-run: it keys on the date it is reporting, so a
     * restart at 10:05 after a run at 10:00 cannot send the school a second copy of the same list.
     * Nullable, because most messages are one-offs with nothing to collide with, and Postgres lets
     * a unique index hold any number of NULLs.
     */
    @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
    dedupeKey: string | null;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;

    /** Set once the provider accepts it. Null on everything that has not gone out. */
    @Column({ type: 'timestamptz', nullable: true })
    sentAt: Date | null;
}
