import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditLog, type AuditChanges } from 'src/entities/audit-log.entity';
import { AuditAction } from 'src/enum/audit-action.enum';
import { diffFields } from './audit.rules';

/** Who acted, as the guard hands it over. Null where a job acted and no human did. */
export interface Actor {
    userId: number | null;
    username: string | null;
}

export interface RecordInput {
    actor: Actor;
    action: AuditAction;
    entityType: string;
    entityId: number;
    /** Only the fields that moved; use `recordUpdate` to derive them from two states. */
    changes?: AuditChanges;
    note?: string | null;
}

/**
 * The one writer of the audit log — E07 S3.
 *
 * **Give it your transaction's `EntityManager`.** The same argument the outbox makes: a record of a
 * change that survives when the change itself rolled back is a lie, and one that is lost when the
 * change succeeded is a gap. Passed a manager, the row is written with it and shares its fate.
 * Called without one it writes on its own connection, which is right only where there is no
 * surrounding transaction to join.
 *
 * There is no `update` and no `delete` here, and that is the whole point of the class: the only
 * thing anybody can do to this table through the application is add to it.
 */
@Injectable()
export class AuditService {
    constructor(
        @InjectRepository(AuditLog)
        private readonly auditLogRepository: Repository<AuditLog>,
    ) {}

    async record(input: RecordInput, manager?: EntityManager): Promise<void> {
        const repository = manager ? manager.getRepository(AuditLog) : this.auditLogRepository;

        await repository.insert({
            actorUserId: input.actor.userId,
            actorUsername: input.actor.username,
            action: input.action,
            entityType: input.entityType,
            entityId: input.entityId,
            changes: input.changes ?? {},
            note: input.note ?? null,
        });
    }

    /**
     * The trail for one thing, newest first — the read behind "cine a schimbat factura 412".
     *
     * Admin-only at the controller. There is no per-parent view of this and deliberately so: the
     * log is about what the school's staff did, and handing a family a filtered slice of staff
     * activity is a different feature with a different set of questions behind it.
     */
    async find(query: { entityType?: string; entityId?: number; actorUserId?: number; limit?: number }): Promise<AuditLog[]> {
        const qb = this.auditLogRepository.createQueryBuilder('audit');

        // Only `andWhere`, never `where`, once composition has started — CLAUDE.md's rule, and the
        // one that let a parent read another family's payment before it was written down.
        if (query.entityType) qb.andWhere('audit.entityType = :entityType', { entityType: query.entityType });
        if (query.entityId !== undefined) qb.andWhere('audit.entityId = :entityId', { entityId: query.entityId });
        if (query.actorUserId !== undefined) qb.andWhere('audit.actorUserId = :actorUserId', { actorUserId: query.actorUserId });

        return qb
            .orderBy('audit.occurredAt', 'DESC')
            .addOrderBy('audit.id', 'DESC')
            .take(query.limit ?? 50)
            .getMany();
    }

    /**
     * The common case: something was edited, and only the fields that moved are worth keeping.
     *
     * **Writes nothing when nothing changed.** A save that set every field to what it already held
     * is not an event, and a log full of empty updates is a log nobody reads — which is the failure
     * mode this story exists to avoid, arriving by a different road.
     */
    async recordUpdate(
        params: {
            actor: Actor;
            entityType: string;
            entityId: number;
            before: Record<string, unknown>;
            after: Record<string, unknown>;
            fields: string[];
            note?: string | null;
        },
        manager?: EntityManager,
    ): Promise<void> {
        const changes = diffFields(params.before, params.after, params.fields);
        if (Object.keys(changes).length === 0) return;

        await this.record(
            {
                actor: params.actor,
                action: AuditAction.UPDATED,
                entityType: params.entityType,
                entityId: params.entityId,
                changes,
                note: params.note ?? null,
            },
            manager,
        );
    }
}
