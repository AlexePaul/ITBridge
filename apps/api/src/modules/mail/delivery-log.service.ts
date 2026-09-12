import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutboxMessage } from 'src/entities/outbox-message.entity';
import { OutboxStatus } from 'src/enum/outbox-status.enum';
import { SCHOOL_TIME_ZONE } from 'src/common/school-clock';
import { OutboxHealth, STUCK_AFTER_MINUTES, stuckBefore } from './outbox-health.rules';

/** What the delivery screen filters on. Everything optional; absent means "no narrowing". */
export interface DeliveryLogFilter {
    status?: OutboxStatus;
    /** Substring of the recipient address, for „a primit familia X?". */
    to?: string;
    /** `YYYY-MM-DD`, inclusive at both ends, against the day the message was queued. */
    from?: string;
    until?: string;
    limit?: number;
}

/**
 * The delivery record — E17/S5.
 *
 * Read-only, and deliberately so: nothing here retries, deletes or edits a message. A retry that a
 * human can trigger is a different decision (it would have to answer "and what if it was already
 * delivered?"), and the story asks for the record, not the controls. What it answers is the one
 * question that actually gets asked — *a primit părintele anunțul?* — and it answers it about
 * messages that never left as readily as about ones that failed.
 */
@Injectable()
export class DeliveryLogService {
    constructor(@InjectRepository(OutboxMessage) private readonly outboxRepository: Repository<OutboxMessage>) {}

    /**
     * The log, newest first.
     *
     * The body comes along: an admin asking whether a family was told needs to see *what* they
     * would have been told, and the alternative is a second request per row on a screen whose whole
     * job is scanning.
     */
    async list(filter: DeliveryLogFilter = {}) {
        const qb = this.outboxRepository
            .createQueryBuilder('message')
            .orderBy('message.createdAt', 'DESC')
            .take(Math.min(filter.limit ?? 200, 500));

        if (filter.status) qb.andWhere('message.status = :status', { status: filter.status });
        // `ILIKE` rather than equality: the admin remembers a name, not the exact address.
        if (filter.to) qb.andWhere('message.to ILIKE :to', { to: `%${filter.to}%` });
        // **Both ends are the school's midnight, not Greenwich's.** `createdAt` is `timestamptz`, and
        // a bound string with no offset is read in the session's zone — which is UTC on the server,
        // as it is in CI. So `from`/`until`, which the screen builds from the day an admin is
        // looking at, were compared against instants up to three hours off: everything queued
        // between midnight and 03:00 in Bucharest landed under the *previous* day, and asking for
        // today at 00:30 returned nothing at all. `AT TIME ZONE` moves the boundary onto the
        // school's clock and gets the DST offset right on its own — +03:00 in summer, +02:00 in
        // winter — which appending a fixed offset would not.
        if (filter.from) {
            qb.andWhere('message.createdAt >= (:from)::timestamp AT TIME ZONE :zone', { from: `${filter.from}T00:00:00`, zone: SCHOOL_TIME_ZONE });
        }
        if (filter.until) {
            qb.andWhere('message.createdAt <= (:until)::timestamp AT TIME ZONE :zone', {
                until: `${filter.until}T23:59:59.999`,
                zone: SCHOOL_TIME_ZONE,
            });
        }

        return qb.getMany();
    }

    /**
     * How many messages sit in each state — the header of the screen.
     *
     * One grouped query rather than four counts, and every state is present even at zero: a
     * missing „nelivrabile: 0" reads as "not measured" rather than as "none", which is the opposite
     * of what the number is for.
     */
    async summary(): Promise<Record<OutboxStatus, number>> {
        const rows = await this.outboxRepository
            .createQueryBuilder('message')
            .select('message.status', 'status')
            .addSelect('COUNT(*)::int', 'count')
            .groupBy('message.status')
            .getRawMany<{ status: OutboxStatus; count: number }>();

        const summary = {
            [OutboxStatus.PENDING]: 0,
            [OutboxStatus.SENT]: 0,
            [OutboxStatus.FAILED]: 0,
            [OutboxStatus.UNDELIVERABLE]: 0,
        };
        for (const row of rows) summary[row.status] = row.count;
        return summary;
    }

    /**
     * The three ways a message fails to reach a family — E17/S5, read by the dashboard.
     *
     * `summary` above answers "what is in the table"; this answers "what has not arrived", and the
     * two differ by more than a filter. Two of the three are statuses, so a `count` finds them. The
     * third is not: a message the dispatcher never claimed stays `pending`, which is the same row
     * shape as one waiting out a backoff, and the difference is only visible against a clock.
     *
     * That third one is the reason this method exists. A queue that stops has no error anywhere —
     * `/ready` stays green, no row turns red, and the only symptom is that families quietly stop
     * hearing from the school. E17/S5's own sentence for it: „un mesaj care nu ajunge nu seamănă cu
     * o eroare, seamănă cu liniște."
     *
     * One query rather than three, for the same reason `summary` is one.
     *
     * **The `WHERE` is not decoration.** `sent` rows are never deleted — the entity says so where
     * it declares `IDX_outbox_claim` — so they are the table, and everything this method wants is
     * in the handful of rows that are not sent. Naming the three states lets that index answer the
     * whole question: measured on 200k rows, a parallel sequential scan at 16.9 ms becomes an
     * index-only scan at 0.1 ms, and the gap widens with every message the school sends. Without
     * it this is a full scan on a screen an admin opens all day.
     */
    async health(now: Date = new Date()): Promise<OutboxHealth> {
        const row = await this.outboxRepository
            .createQueryBuilder('message')
            .select(`COUNT(*) FILTER (WHERE message.status = :failed)::int`, 'failed')
            .addSelect(`COUNT(*) FILTER (WHERE message.status = :undeliverable)::int`, 'undeliverable')
            .addSelect(`COUNT(*) FILTER (WHERE message.status = :pending AND message.nextAttemptAt <= :due)::int`, 'stuck')
            .where('message.status IN (:...counted)')
            .setParameters({
                counted: [OutboxStatus.FAILED, OutboxStatus.UNDELIVERABLE, OutboxStatus.PENDING],
                failed: OutboxStatus.FAILED,
                undeliverable: OutboxStatus.UNDELIVERABLE,
                pending: OutboxStatus.PENDING,
                due: stuckBefore(now),
            })
            .getRawOne<{ failed: number; undeliverable: number; stuck: number }>();

        return {
            failed: row?.failed ?? 0,
            undeliverable: row?.undeliverable ?? 0,
            stuck: row?.stuck ?? 0,
            stuckAfterMinutes: STUCK_AFTER_MINUTES,
        };
    }
}
