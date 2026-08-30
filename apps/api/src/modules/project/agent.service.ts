import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Group } from 'src/entities/group.entity';
import { AgentStatus } from 'src/entities/agent-status.entity';
import { UnassignedFile } from 'src/entities/unassigned-file.entity';
import { AgentHeartbeatDto } from './dto/agentHeartbeat.dto';
import { ReportUnassignedFileDto } from './dto/reportUnassignedFile.dto';

/**
 * Everything the upload agent asks the API for, and everything it tells it. E14/S2.
 *
 * The agent is a service on one Windows machine in the office. It mirrors the folder tree onto a
 * network share, uploads what teachers save there, moves what it cannot place into `_neatribuite`,
 * and says every few minutes that it is still alive. The three shapes below are that whole
 * conversation.
 *
 * It authenticates as an ordinary user with the `ADMIN` role, because no other role exists — E09's
 * teacher role is deliberately not being built. The unpleasant consequence is that the agent's
 * credential can do everything an admin can, invoicing included. Accepted because the machine sits
 * in an office and because the alternative is the first new role in a set that was postponed on
 * purpose; when the first teacher who is not an owner appears, it gets a narrow service role and
 * this becomes a line in a guard rather than a rewrite.
 */
@Injectable()
export class AgentService {
    constructor(
        @InjectRepository(Group) private readonly groupRepository: Repository<Group>,
        @InjectRepository(AgentStatus) private readonly agentStatusRepository: Repository<AgentStatus>,
        @InjectRepository(UnassignedFile) private readonly unassignedRepository: Repository<UnassignedFile>,
    ) {}

    /**
     * The folder tree, generated from the database. E14/S2.
     *
     * **The mirror is generated, never the source of truth.** The agent creates, renames and moves
     * folders to match this; a folder somebody makes by hand on the share maps to no child, and the
     * file that lands in it becomes an `UnassignedFile` rather than a guess.
     *
     * The child's id travels with the name because the folder is named after both. Two children
     * called Andrei in one group is week three, not an edge case, and a folder renamed by hand must
     * not orphan the files inside it — the same lesson as the object key, in another place.
     *
     * A child is in exactly one group, so this is a tree and every file has exactly one path to a
     * child. That is what lets the agent place a file without ever having to guess which group it
     * came from; if a child were ever in two, this is the first thing that breaks.
     */
    async mirror() {
        const groups = await this.groupRepository.find({
            where: { isActive: true },
            relations: ['room', 'room.location', 'children'],
            order: { name: 'ASC' },
        });

        const byLocation = new Map<
            number,
            { id: number; name: string; groups: { id: number; name: string; children: { id: number; firstName: string; lastName: string }[] }[] }
        >();

        for (const group of groups) {
            const location = group.room.location;
            const entry = byLocation.get(location.id) ?? { id: location.id, name: location.name, groups: [] };
            entry.groups.push({
                id: group.id,
                name: group.name,
                children: group.children.map((child) => ({ id: child.id, firstName: child.firstName, lastName: child.lastName })),
            });
            byLocation.set(location.id, entry);
        }

        return { locations: [...byLocation.values()] };
    }

    /**
     * The agent saying it is alive, and how it is doing. E14/S2.
     *
     * Upserted on the name rather than inserted: this is called every few minutes forever, and a row
     * per beat would be a table nobody reads growing without limit. What matters is the last one.
     *
     * `lastError` is cleared on a clean pass, deliberately. An error that stays after the cause is
     * gone teaches an admin to ignore the field, which is the same as not having it.
     */
    async heartbeat(dto: AgentHeartbeatDto): Promise<AgentStatus> {
        const existing = await this.agentStatusRepository.findOne({ where: { agentName: dto.agentName } });
        const row =
            existing ??
            this.agentStatusRepository.create({
                agentName: dto.agentName,
            });

        row.lastSeenAt = new Date();
        row.version = dto.version ?? null;
        row.watchedRoot = dto.watchedRoot ?? null;
        row.pendingFiles = dto.pendingFiles ?? 0;
        row.lastError = dto.lastError ?? null;

        return this.agentStatusRepository.save(row);
    }

    /** What the group screen reads to say "the agent has not reported for 3 hours". */
    async statuses(): Promise<AgentStatus[]> {
        return this.agentStatusRepository.find({ order: { agentName: 'ASC' } });
    }

    /**
     * The agent reporting a file it moved to `_neatribuite`. E14/S2.
     *
     * Idempotent on `reportKey`, because an agent restarted three times in an afternoon rescans the
     * same folder and would otherwise file the same stray three times. `ON CONFLICT DO NOTHING`
     * rather than a check first: two passes waking at the same second would both see nothing.
     */
    async reportUnassigned(dto: ReportUnassignedFileDto): Promise<UnassignedFile | null> {
        const reportKey = `${dto.groupId ?? 'root'}:${dto.relativePath}`.slice(0, 1100);

        const inserted = await this.unassignedRepository
            .createQueryBuilder()
            .insert()
            .into(UnassignedFile)
            .values({
                group: dto.groupId ? { id: dto.groupId } : null,
                relativePath: dto.relativePath,
                fileName: dto.fileName,
                sizeBytes: dto.sizeBytes ?? 0,
                reason: dto.reason,
                reportKey,
            })
            .orIgnore()
            .returning('id')
            .execute();

        const id = (inserted.raw as { id: number }[])[0]?.id;
        if (id === undefined) return null;

        return this.unassignedRepository.findOne({ where: { id }, relations: ['group'] });
    }

    /**
     * What is waiting for an admin. Unresolved by default, because that is the working list; the
     * resolved ones stay in the table as a record of what happened, not as a to-do item.
     */
    async findUnassigned(groupId?: number, includeResolved = false): Promise<UnassignedFile[]> {
        const qb = this.unassignedRepository.createQueryBuilder('file').leftJoinAndSelect('file.group', 'group');

        if (groupId) qb.andWhere('group.id = :groupId', { groupId });
        // `IsNull()`, not `resolvedAt: undefined`: an `undefined` in a TypeORM `where` means "ignore
        // this condition" rather than "is null", which has already produced two bugs in this repo.
        if (!includeResolved) qb.andWhere({ resolvedAt: IsNull() });

        return qb.orderBy('file.reportedAt', 'DESC').getMany();
    }

    /**
     * An admin saying they have dealt with a stray file.
     *
     * The row is marked, never deleted, and the file itself is untouched on the share: the agent
     * moved it to `_neatribuite` and only a person can decide whether it belonged to a child, to
     * nobody, or in the bin.
     */
    async resolveUnassigned(id: number): Promise<UnassignedFile> {
        const file = await this.unassignedRepository.findOne({ where: { id }, relations: ['group'] });
        if (!file) throw new NotFoundException('Unassigned file not found');

        file.resolvedAt = new Date();
        return this.unassignedRepository.save(file);
    }
}
