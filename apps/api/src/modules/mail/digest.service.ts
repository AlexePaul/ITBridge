import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { OutboxMessage } from 'src/entities/outbox-message.entity';
import { Profile } from 'src/entities/profile.entity';
import { MessageFrequency } from 'src/enum/message-frequency.enum';
import { OutboxStatus } from 'src/enum/outbox-status.enum';
import { composeDigest, DigestItem } from './digest-mail';
import { isDue } from './digest.rules';

export interface DigestRunResult {
    /** Messages that were still waiting when the pass began. */
    held: number;
    /** Messages sent on their own, because they were alone or their deadline came up. */
    released: number;
    /** Combined messages written. */
    digests: number;
    /** Messages folded into those, and therefore never sent as themselves. */
    folded: number;
}

/** How many held messages one pass takes. Small, like the dispatcher's: another follows shortly. */
export const DEFAULT_DIGEST_BATCH = 200;

/**
 * Digests instead of bursts — E17/S6.
 *
 * A parent with two children, projects, a make-up and an invoice could hear from the school ten
 * times a week; the story's answer is that they hear once. What makes that safe to do by default is
 * that **nothing here decides whether a message arrives, only how many envelopes it arrives in**.
 * Two consequences follow, and both are load-bearing:
 *
 *  - **Urgent messages never reach this class at all.** A called-off class, a confirmation link, an
 *    approved account, a place freed on the waiting list: none of them pass a `digest` to the queue,
 *    so none of them is ever held. That is an opt-in rather than a list of exemptions maintained
 *    here, because a list is a thing somebody forgets to add to.
 *  - **A deadline beats the cadence.** E12's make-up warning goes out seven days before the right
 *    lapses; a weekly digest that held it for a week would deliver a warning about something already
 *    gone. `digestNotAfter` is the sender saying so, and it wins.
 *
 * The pass is a plain method, driven by `DigestJob`'s timer, exactly as every other scheduled thing
 * here keeps its selection separate from its clock — a `@Cron` does not fire under jest, so logic
 * that lives in one cannot be tested.
 */
@Injectable()
export class DigestService {
    private readonly logger = new Logger('Digest');

    /**
     * Only the `DataSource`: every read and write in a pass happens through the one transaction's
     * manager, because claiming a message and folding it have to stand or fall together. A repository
     * injected alongside would be a second connection into the same rows — the one way to see, and
     * fold, a message another pass is already holding.
     */
    constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

    /**
     * One pass: look at everything being held, and let out whatever has waited long enough.
     *
     * Claimed with `FOR UPDATE SKIP LOCKED`, like the dispatcher's own batch and for the same
     * reason: two overlapping passes must not both fold the same messages into two different
     * digests. The lock *is* the claim — a second pass sees nothing rather than queueing behind.
     */
    async run(options: { now?: Date; batchSize?: number } = {}): Promise<DigestRunResult> {
        const now = options.now ?? new Date();
        const result: DigestRunResult = { held: 0, released: 0, digests: 0, folded: 0 };

        await this.dataSource.transaction(async (manager) => {
            const held = await manager
                .createQueryBuilder(OutboxMessage, 'outbox')
                .setLock('pessimistic_write')
                .setOnLocked('skip_locked')
                .andWhere('outbox.status = :status', { status: OutboxStatus.PENDING })
                .andWhere('outbox.digestSummary IS NOT NULL')
                .andWhere('outbox.digestReleasedAt IS NULL')
                .orderBy('outbox.id', 'ASC')
                .limit(options.batchSize ?? DEFAULT_DIGEST_BATCH)
                .getMany();

            result.held = held.length;
            if (held.length === 0) return;

            for (const [address, messages] of groupByRecipient(held)) {
                const recipient = await this.recipientOf(address, manager);
                if (!messages.some((message) => isDue(message, recipient.frequency, now))) continue;

                // A family who asked for each message as it happens gets each message as it happens.
                // Combining them anyway would be the setting meaning something other than it says.
                if (recipient.frequency === MessageFrequency.IMMEDIATE || messages.length === 1) {
                    await this.release(messages, now, manager);
                    result.released += messages.length;
                    continue;
                }

                await this.fold(address, recipient.firstName, messages, now, manager);
                result.digests += 1;
                result.folded += messages.length;
            }
        });

        if (result.digests > 0 || result.released > 0) {
            this.logger.log(`Digest pass: ${result.released} released as themselves, ${result.folded} folded into ${result.digests} combined message(s).`);
        }
        return result;
    }

    /** Lets messages out as themselves. The dispatcher picks them up on its next tick. */
    private async release(messages: OutboxMessage[], now: Date, manager: EntityManager): Promise<void> {
        await manager.update(
            OutboxMessage,
            messages.map((message) => message.id),
            { digestReleasedAt: now },
        );
    }

    /**
     * Writes the combined message and marks its parts as having gone inside it.
     *
     * The parts become `digested`, not `sent`: they were never handed to the provider, and a
     * delivery record claiming otherwise would answer „a primit părintele anunțul?" with a message
     * nobody posted. They keep their bodies and point at the row that did go, so the record shows
     * both halves — S5's rule that nothing which was going to reach a family disappears.
     */
    private async fold(address: string, firstName: string, messages: OutboxMessage[], now: Date, manager: EntityManager): Promise<void> {
        const items: DigestItem[] = messages.map((message) => ({
            subject: message.subject,
            // Non-null by construction: the claim asks for `digestSummary IS NOT NULL`, which is
            // what being foldable means.
            summary: message.digestSummary as string,
        }));
        const mail = composeDigest(firstName, items);

        const inserted = await manager
            .createQueryBuilder()
            .insert()
            .into(OutboxMessage)
            .values({
                to: address,
                subject: mail.subject,
                bodyText: mail.bodyText,
                bodyHtml: mail.bodyHtml,
                // The digest itself is never held: it is the thing everybody was waiting for.
                digestSummary: null,
                // Attachments are deliberately not carried across. E14's thumbnails belong to one
                // child's message; hanging several children's pictures off one envelope is a
                // different email than the one that was composed, and the links in each fragment
                // still reach the work.
                attachments: null,
            })
            .returning('id')
            .execute();

        const digestId = (inserted.raw as { id: number }[])[0].id;
        await manager.update(
            OutboxMessage,
            messages.map((message) => message.id),
            { status: OutboxStatus.DIGESTED, digestReleasedAt: now, digest: { id: digestId } },
        );
    }

    /**
     * Who is at this address, and how often they want their post.
     *
     * No profile means no preference to honour — the office's own address, most often — so the
     * answer is `IMMEDIATE`: the school's internal mail is never held, and never combined with
     * anything.
     */
    private async recipientOf(address: string, manager: EntityManager): Promise<{ frequency: MessageFrequency; firstName: string }> {
        const profile = await manager.getRepository(Profile).findOne({ where: { email: address } });
        if (!profile) return { frequency: MessageFrequency.IMMEDIATE, firstName: '' };
        return { frequency: profile.messageFrequency, firstName: profile.firstName };
    }
}

/** One inbox, one group. The address is the family — the same unit every sender here writes to. */
function groupByRecipient(messages: OutboxMessage[]): Map<string, OutboxMessage[]> {
    const byAddress = new Map<string, OutboxMessage[]>();
    for (const message of messages) {
        const existing = byAddress.get(message.to);
        if (existing) existing.push(message);
        else byAddress.set(message.to, [message]);
    }
    return byAddress;
}
