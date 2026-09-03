import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutboxMessage } from 'src/entities/outbox-message.entity';
import { OutboxStatus } from 'src/enum/outbox-status.enum';

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
        if (filter.from) qb.andWhere('message.createdAt >= :from', { from: `${filter.from}T00:00:00` });
        if (filter.until) qb.andWhere('message.createdAt <= :until', { until: `${filter.until}T23:59:59.999` });

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
            [OutboxStatus.DIGESTED]: 0,
        };
        for (const row of rows) summary[row.status] = row.count;
        return summary;
    }
}
