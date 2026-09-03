import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { OutboxAttachment, OutboxMessage } from 'src/entities/outbox-message.entity';
import { OutboxStatus } from 'src/enum/outbox-status.enum';
import { DeliveryFailureReason } from 'src/enum/delivery-failure-reason.enum';
import { S3Service } from 'src/modules/storage/s3.service';
import { MailAttachment, MailSendError, MailService, MAX_ATTACHMENT_BYTES } from './mail.service';

/**
 * The transactional outbox from E17/S3: messages are written down, then sent.
 *
 * Two separate jobs, deliberately kept apart:
 *
 *  - `queue` is called by business code, **inside that code's own transaction**. The invoice and
 *    the notification about it commit together or not at all. Nothing here talks to the provider,
 *    so an outage cannot fail an invoice.
 *  - `dispatchPending` is called by the scheduler. It claims a batch, hands each message to
 *    `MailService`, and records what happened.
 *
 * Both halves are ordinary methods so the queue can be tested without a scheduler and the
 * scheduler can be tested without a queue.
 */

/** How many messages one pass takes. Small: the pass holds nothing open, and another follows in 30s. */
export const DEFAULT_BATCH_SIZE = 25;

/**
 * Resend allows two requests a second on the current plan, and a batch is sent in a loop. Without a
 * gap between sends, a full batch trips the limit and the second half comes back 429 — retried, so
 * nothing is lost, but the queue then spends its time apologising to itself. 550ms keeps a pass
 * under the limit with room to spare.
 */
export const DEFAULT_PACING_MS = 550;

/**
 * How many times a message is offered to the provider before it is given up on.
 *
 * Seven, with the backoff below, spreads the attempts over roughly two hours (0, 2, 6, 14, 30, 62,
 * 122 minutes). That number is not arbitrary: E17/S3's acceptance is that a provider unavailable
 * *for an hour* loses no message, so the last attempt has to fall comfortably after the hour, not
 * on it. A permanent refusal — a bad address, an unverified domain — stops immediately and never
 * reaches this count.
 */
export const MAX_ATTEMPTS = 7;

const BACKOFF_BASE_MS = 2 * 60 * 1000;
const BACKOFF_CAP_MS = 60 * 60 * 1000;

/** Truncated before it goes on the row: a provider can answer with an entire HTML error page. */
const MAX_ERROR_LENGTH = 1000;

/** Doubling, from two minutes, capped at an hour. `attempts` is the count *including* the one just made. */
export function backoffFrom(now: Date, attempts: number): Date {
    const exponent = Math.max(0, attempts - 1);
    const delay = Math.min(BACKOFF_BASE_MS * 2 ** exponent, BACKOFF_CAP_MS);
    return new Date(now.getTime() + delay);
}

export interface QueuedMessage {
    to: string;
    subject: string;
    bodyText: string;
    bodyHtml?: string | null;
    /**
     * Optional idempotency key. When two runs of the same job would produce the same message, give
     * them the same key and the database refuses the second — see `OutboxMessage.dedupeKey`.
     */
    dedupeKey?: string | null;
    /**
     * Files to hang off the message, named by storage key rather than carried as bytes. Read when
     * the message is handed to the provider — see `OutboxMessage.attachments`.
     */
    attachments?: OutboxAttachment[] | null;
}

export interface DispatchResult {
    claimed: number;
    sent: number;
    failed: number;
}

export interface DispatchOptions {
    now?: Date;
    batchSize?: number;
    /** Milliseconds between sends within one batch. Tests pass 0; nothing else should. */
    pacingMs?: number;
}

@Injectable()
export class OutboxService {
    private readonly logger = new Logger('Outbox');

    constructor(
        @InjectRepository(OutboxMessage) private readonly outboxRepository: Repository<OutboxMessage>,
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly mailService: MailService,
        private readonly s3Service: S3Service,
    ) {}

    /**
     * Writes one message into the queue. Returns the row, or `null` when `dedupeKey` says an
     * identical message is already queued.
     *
     * Pass `manager` — the `EntityManager` of the caller's transaction — whenever the message is
     * caused by something else being saved. That is the word *transactional* in "transactional
     * outbox", and skipping it reintroduces the two failures the table exists to prevent: a
     * business change nobody was told about, or a notification about something that was rolled
     * back.
     *
     * The duplicate is refused with `ON CONFLICT DO NOTHING` rather than caught as a unique
     * violation. That is not a style preference: a failed statement inside the caller's
     * transaction aborts *the whole transaction*, so catching the error here would mean a repeated
     * message silently taking the invoice down with it. Nor is a `SELECT` first enough — two
     * schedulers waking at the same second would both see nothing and both insert.
     */
    /**
     * Queues a marketing message, or declines to — E17/S4.
     *
     * Returns `null` when the family has not opted in, and writes **nothing**: a parent who said no
     * and does not receive a newsletter is the system working, not a delivery that failed. That is
     * the line between this and `queueOrRecord` — S5 insists a message with nowhere to go leaves a
     * row precisely because somebody *should* have been reached and was not. Here nobody should
     * have been. The caller counts what it skipped; the delivery record stays a record of things
     * that went wrong.
     *
     * There is no marketing sender yet. This exists so the guarantee is enforced from the first one
     * rather than retrofitted around it — which is the moment it would be got wrong.
     */
    async queueMarketing(
        // `confirmed` is passed straight through to `queueOrRecord` below, and belongs in the type
        // for the same reason it belongs there: an unconfirmed address is one nobody has proved is
        // theirs, and marketing is not the message to start writing to it with.
        recipient: { email: string | null | undefined; marketingOptIn: boolean; confirmed?: boolean },
        message: Omit<QueuedMessage, 'to'>,
        manager?: EntityManager,
    ) {
        if (!recipient.marketingOptIn) return null;
        return this.queueOrRecord(recipient, message, manager);
    }

    /**
     * Queues the message, or records that it had nowhere to go — E17/S5.
     *
     * The whole point: a family with no address **is not skipped in silence.** Callers used to
     * branch on `if (profile.email)` and log a warning down the other side, which put the fact in a
     * log nobody reads and left the delivery record saying nothing happened. Here the absence of a
     * recipient produces a row like any other, in `UNDELIVERABLE`, carrying which of the two cases
     * it is — and the message body is kept, so an admin can see what the family did not get.
     *
     * `to` doubles as the reason detector when the caller passes a profile rather than an address:
     * empty means `NO_ADDRESS`, and the caller says `unconfirmed` when there is an address nobody
     * has clicked through.
     */
    async queueOrRecord(
        recipient: { email: string | null | undefined; confirmed?: boolean },
        message: Omit<QueuedMessage, 'to'>,
        manager?: EntityManager,
    ): Promise<OutboxMessage | null> {
        if (!recipient.email) {
            return this.recordUndeliverable(message, DeliveryFailureReason.NO_ADDRESS, manager);
        }
        if (recipient.confirmed === false) {
            return this.recordUndeliverable(message, DeliveryFailureReason.UNCONFIRMED_ADDRESS, manager, recipient.email);
        }
        return this.queue({ ...message, to: recipient.email }, manager);
    }

    /**
     * Writes the row that says "this went nowhere, and here is why".
     *
     * `nextAttemptAt` is left where it falls and the status is terminal, so the dispatcher's claim
     * query — which asks for `pending` — never sees it. No backoff makes an address appear.
     */
    private async recordUndeliverable(
        message: Omit<QueuedMessage, 'to'>,
        reason: DeliveryFailureReason,
        manager?: EntityManager,
        address?: string,
    ): Promise<OutboxMessage | null> {
        const repository = manager ? manager.getRepository(OutboxMessage) : this.outboxRepository;

        const result = await repository
            .createQueryBuilder()
            .insert()
            .into(OutboxMessage)
            .values({
                // Empty rather than a placeholder: a fake address in this column would be
                // indistinguishable from a real one that bounced.
                to: address ?? '',
                subject: message.subject,
                bodyText: message.bodyText,
                bodyHtml: message.bodyHtml ?? null,
                dedupeKey: message.dedupeKey ?? null,
                attachments: message.attachments?.length ? message.attachments : null,
                status: OutboxStatus.UNDELIVERABLE,
                undeliverableReason: reason,
            })
            .orIgnore()
            .returning('*')
            .execute();

        const row = (result.raw as OutboxMessage[])[0] ?? null;
        if (row) {
            this.logger.warn(`Message "${message.subject}" is undeliverable: ${reason}.`);
        }
        return row;
    }

    async queue(message: QueuedMessage, manager?: EntityManager): Promise<OutboxMessage | null> {
        const repository = manager ? manager.getRepository(OutboxMessage) : this.outboxRepository;

        const result = await repository
            .createQueryBuilder()
            .insert()
            .into(OutboxMessage)
            .values({
                to: message.to,
                subject: message.subject,
                bodyText: message.bodyText,
                bodyHtml: message.bodyHtml ?? null,
                dedupeKey: message.dedupeKey ?? null,
                attachments: message.attachments?.length ? message.attachments : null,
            })
            .orIgnore()
            .returning('*')
            .execute();

        // `RETURNING` gives back raw columns, which here carry the same names as the properties.
        // An empty array means the insert hit `dedupeKey` and did nothing.
        const rows = result.raw as OutboxMessage[];
        return rows[0] ?? null;
    }

    /**
     * One pass of the queue: claim what is due, try to send it, record the outcome.
     *
     * Claiming and sending are separate transactions on purpose. Holding a row lock across an HTTP
     * call would keep a database transaction open for as long as the provider is slow, and a batch
     * of twenty-five would hold twenty-five of them. The claim instead moves `nextAttemptAt`
     * forward before releasing, so the row is invisible to the next pass whether or not this one
     * finishes — a process killed mid-send loses nothing, it just retries after the backoff.
     */
    async dispatchPending(options: DispatchOptions = {}): Promise<DispatchResult> {
        const now = options.now ?? new Date();
        const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
        const pacingMs = options.pacingMs ?? DEFAULT_PACING_MS;

        const claimed = await this.claim(now, batchSize);
        let sent = 0;
        let failed = 0;

        for (const [index, message] of claimed.entries()) {
            if (index > 0 && pacingMs > 0) {
                await pause(pacingMs);
            }
            try {
                if (await this.deliver(message)) {
                    sent += 1;
                } else {
                    failed += 1;
                }
            } catch (error: unknown) {
                // `deliver` swallows anything the provider does; reaching here means writing the
                // outcome down failed, which is a database problem. The rest of the batch is
                // unaffected and this row simply retries — the backoff was already set when it was
                // claimed, so nothing is stuck.
                failed += 1;
                this.logger.error(`Could not record the outcome of message ${message.id}: ${error instanceof Error ? error.message : String(error)}`);
            }
        }

        return { claimed: claimed.length, sent, failed };
    }

    /**
     * Takes ownership of up to `batchSize` due messages.
     *
     * `FOR UPDATE SKIP LOCKED` is what makes a second pass — another scheduler tick that overlaps
     * this one, or a second process during a deploy — skip the rows this one is holding instead of
     * queueing behind them or, worse, sending them a second time. It is the mechanism E17/S3 names,
     * and the reason the queue can live in Postgres with no broker behind it.
     *
     * The attempt is counted here, at the moment the message is taken, not after the provider
     * answers. If the process dies in between, the attempt still happened as far as anyone can
     * tell — the provider may well have received it — and counting it is what stops a crash loop
     * from sending the same message forever.
     */
    private async claim(now: Date, batchSize: number): Promise<OutboxMessage[]> {
        return this.dataSource.transaction(async (manager) => {
            const due = await manager
                .createQueryBuilder(OutboxMessage, 'outbox')
                .setLock('pessimistic_write')
                .setOnLocked('skip_locked')
                // `andWhere` throughout, never `where`: house rule, because a later `where` silently
                // replaces every condition before it.
                .andWhere('outbox.status = :status', { status: OutboxStatus.PENDING })
                .andWhere('outbox.nextAttemptAt <= :now', { now })
                .orderBy('outbox.nextAttemptAt', 'ASC')
                .limit(batchSize)
                .getMany();

            for (const message of due) {
                message.attempts += 1;
                message.nextAttemptAt = backoffFrom(now, message.attempts);
                await manager.update(OutboxMessage, message.id, {
                    attempts: message.attempts,
                    nextAttemptAt: message.nextAttemptAt,
                });
            }

            return due;
        });
    }

    /**
     * Sends one claimed message and writes down what came back.
     *
     * Only the send is inside the `try`, deliberately. Wrapping the bookkeeping too would make a
     * database error look like a rejected message and write a Postgres error into `lastError` as
     * if the provider had said it. What remains, and cannot be removed from this side: if the send
     * succeeds and marking it sent then fails, the message goes out a second time on the next pass.
     * Closing that needs an idempotency key at the provider, which is E17/S5 territory.
     */
    private async deliver(message: OutboxMessage): Promise<boolean> {
        const attachments = await this.resolveAttachments(message);

        let failure: unknown;
        try {
            await this.mailService.send({
                to: message.to,
                subject: message.subject,
                text: message.bodyText,
                html: message.bodyHtml,
                ...(attachments.length ? { attachments } : {}),
            });
        } catch (error: unknown) {
            failure = error;
        }

        if (failure !== undefined) {
            await this.recordFailure(message, failure);
            return false;
        }

        await this.outboxRepository.update(message.id, {
            status: OutboxStatus.SENT,
            sentAt: new Date(),
            lastError: null,
        });
        return true;
    }

    /**
     * Reads the attachments named on the row out of object storage.
     *
     * **A missing or oversized object does not stop the message.** The picture is the nicer half of
     * E14's email, and the half that matters is the link into the portal: a parent who gets a
     * message with a broken thumbnail has still been told their child built something, whereas a
     * message held back over an image is a document nobody hears about. Whatever went wrong is
     * logged, not written to `lastError`, which is reserved for what the provider said.
     */
    private async resolveAttachments(message: OutboxMessage): Promise<MailAttachment[]> {
        if (!message.attachments?.length) return [];

        const resolved: MailAttachment[] = [];
        let total = 0;

        for (const attachment of message.attachments) {
            try {
                const bytes = await this.s3Service.downloadFile(attachment.storageKey);
                total += bytes.length;
                if (total > MAX_ATTACHMENT_BYTES) {
                    this.logger.warn(`Message ${message.id}: attachments over the size budget, sending without ${attachment.filename}`);
                    break;
                }
                resolved.push({
                    filename: attachment.filename,
                    content: bytes.toString('base64'),
                    contentId: attachment.contentId,
                });
            } catch (error: unknown) {
                this.logger.warn(
                    `Message ${message.id}: could not read attachment ${attachment.filename}: ${error instanceof Error ? error.message : String(error)}`,
                );
            }
        }

        return resolved;
    }

    /**
     * Writes why a send did not happen, and decides whether there is any point asking again.
     *
     * A permanent refusal stops here whatever the attempt count says; a temporary one stays pending
     * until the attempts run out. Either way the row remains — E17/S5 needs "no, and here is what
     * the provider said" to be answerable from the interface, which a deleted row cannot do.
     */
    private async recordFailure(message: OutboxMessage, error: unknown): Promise<void> {
        const permanent = error instanceof MailSendError && error.permanent;
        const exhausted = message.attempts >= MAX_ATTEMPTS;
        const reason = (error instanceof Error ? error.message : String(error)).slice(0, MAX_ERROR_LENGTH);

        await this.outboxRepository.update(message.id, {
            status: permanent || exhausted ? OutboxStatus.FAILED : OutboxStatus.PENDING,
            lastError: reason,
        });

        // The recipient is a parent's email address, so it stays out of the log; the id is enough
        // to find the row, which has the address on it and is access-controlled.
        if (permanent) {
            this.logger.error(`Message ${message.id} rejected permanently, not retrying: ${reason}`);
        } else if (exhausted) {
            this.logger.error(`Message ${message.id} given up on after ${message.attempts} attempts: ${reason}`);
        } else {
            this.logger.warn(`Message ${message.id} failed on attempt ${message.attempts}, retrying later: ${reason}`);
        }
    }
}

function pause(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
