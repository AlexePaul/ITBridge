import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { OutboxStatus } from '../enum/outbox-status.enum';
import { DeliveryFailureReason } from '../enum/delivery-failure-reason.enum';
import { Announcement } from './announcement.entity';

/**
 * One file to hang off a message, named by where it lives in the bucket.
 *
 * `contentId` is what the HTML body references as `cid:…`; without it the attachment is a download
 * rather than a picture in the message.
 */
export interface OutboxAttachment {
    filename: string;
    contentId: string;
    storageKey: string;
}

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

    /**
     * Set only on `UNDELIVERABLE`, and it is the whole reason that status exists — E17/S5.
     *
     * Typed rather than folded into `lastError`, because the delivery screen branches on it: one
     * case offers "sună familia", the other "retrimite linkul". Free text could carry the words but
     * not the branch.
     */
    @Column({ type: 'enum', enum: DeliveryFailureReason, nullable: true })
    undeliverableReason: DeliveryFailureReason | null;

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

    /**
     * Inline attachments, resolved from object storage at send time rather than carried here.
     *
     * E14/S4 mails a child's work to their parent with the thumbnail **attached inline (CID)**, not
     * behind a signed URL. A signed URL is a broken image the next morning — SigV4 does not reach
     * past seven days however generously it is read — and a long-lived one would leave a picture of
     * a minor's work reachable from a mailbox forever. An attachment shows offline and leaves
     * nothing behind.
     *
     * The column holds keys, not bytes. Base64 of even a small image in a text column would bloat
     * every claim query that reads this table, for data that is only needed in the second the
     * message is handed to the provider. A key whose object has since gone means the message still
     * goes out, without the picture.
     */
    @Column({ type: 'jsonb', nullable: true })
    attachments: OutboxAttachment[] | null;

    /**
     * The paragraph this message contributes to a combined one, when it is willing to be combined —
     * E17/S6. Null means it goes out on its own, at once.
     *
     * **Null is the safe default, and it is why this is one column rather than a boolean plus a
     * text.** A sender that says nothing keeps sending immediately, exactly as a sender that says
     * nothing about `MessageKind` keeps sending at all; the direction to fail in is "a burst",
     * never "a called-off class held until Monday". And because being combinable *is* having a
     * fragment, the two cannot contradict each other: there is no digestible message with nothing
     * to put in the digest.
     *
     * The fragment is not the body. It carries no greeting and no signature, because the combined
     * message supplies one of each for all of them.
     */
    @Column({ type: 'text', nullable: true })
    digestSummary: string | null;

    /**
     * The last school day on which this is still worth sending, for a message that has one.
     *
     * The safety valve on the cadence: E12's make-up warning is written seven days before the right
     * lapses, so a weekly digest holding it for a week would deliver a warning about something
     * already gone. A sender that knows its message expires says so, and that beats the family's
     * preference — the preference is about packaging, and a package that arrives after the event is
     * not packaging any more.
     *
     * A `date`, not an instant: every deadline that reaches here is a calendar day (an expiry, a due
     * date), and the comparison is text against the school's own day.
     */
    @Column({ type: 'date', nullable: true })
    digestNotAfter: string | null;

    /**
     * Set when the digest pass decided this one goes out **as itself** — because it was alone in the
     * window, or because its deadline came up.
     *
     * The dispatcher's claim asks for it: a row with a fragment and no release is invisible to the
     * queue, which is what "held" means. There is no `held` status for the same reason there is no
     * `sending` one — the state is a fact about two columns, and a third place to say it is a third
     * place for it to be wrong.
     */
    @Column({ type: 'timestamptz', nullable: true })
    digestReleasedAt: Date | null;

    /**
     * The combined message that went in this one's place — E17/S6.
     *
     * Self-referencing, because a digest is an ordinary message: it is queued, claimed, sent and
     * recorded like any other, and the only thing that makes it a digest is that rows point at it.
     */
    @ManyToOne(() => OutboxMessage, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'digest_id' })
    digest: OutboxMessage | null;

    /**
     * The broadcast this message belongs to, when it belongs to one — E17/S7.
     *
     * Null on everything else, which is almost everything: a message about a child, an invoice or a
     * cancelled class has exactly one recipient and no batch to be part of. The column is what turns
     * a broadcast's delivery report into a live count over the queue instead of a number frozen when
     * send was pressed.
     *
     * Nothing in the queue reads it. `OutboxService` neither knows nor asks — the announcement
     * service links its own rows after queueing them, inside the same transaction — so the shared
     * queue keeps working the same way for every other sender.
     */
    @ManyToOne(() => Announcement, { nullable: true, onDelete: 'SET NULL' })
    @JoinColumn({ name: 'announcement_id' })
    announcement: Announcement | null;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;

    /** Set once the provider accepts it. Null on everything that has not gone out. */
    @Column({ type: 'timestamptz', nullable: true })
    sentAt: Date | null;
}
