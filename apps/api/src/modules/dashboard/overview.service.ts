import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Group } from 'src/entities/group.entity';
import { Project } from 'src/entities/project.entity';
import { User } from 'src/entities/user.entity';
import { OutboxMessage } from 'src/entities/outbox-message.entity';
import { ApprovalStatus } from 'src/enum/approval-status.enum';
import { OutboxStatus } from 'src/enum/outbox-status.enum';
import { ProjectStatus } from 'src/enum/project-status.enum';
import { Role } from 'src/enum/role.enum';
import { ClassSessionService } from 'src/modules/class-session/class-session.service';
import { EnrollmentService } from 'src/modules/enrollment/enrollment.service';
import { ArrearsService } from 'src/modules/invoice/arrears.service';
import { addDays, toIsoDate } from 'src/modules/class-session/class-session.dates';

/** One of today's classes, as the overview shows it. */
export interface OverviewSession {
    id: number;
    groupName: string;
    startTime: string;
    endTime: string;
    locationName: string | null;
    /** Whether anybody has taken the register. The whole point of the row. */
    marked: boolean;
}

/** A group with no room left, or nearly none. */
export interface OverviewGroup {
    groupId: number;
    name: string;
    locationName: string | null;
    capacity: number;
    taken: number;
    free: number;
}

export interface Overview {
    /** The school's own day, `YYYY-MM-DD`. */
    date: string;
    today: {
        sessions: OverviewSession[];
        marked: number;
        total: number;
    };
    /** Registers still missing from the week behind today. The backlog, not today's pending work. */
    unmarkedThisWeek: number;
    arrears: {
        families: number;
        outstanding: number;
        /** Past the point where the platform stops writing and somebody has to phone. */
        over60: number;
    };
    /** Groups with a seat or less left, fullest first. */
    groupsNearlyFull: OverviewGroup[];
    /** Uploaded, reviewed by nobody, sent to nobody. */
    projectsAwaitingSend: number;
    /** Families who registered and are waiting to be let in. */
    pendingApprovals: number;
    /** Messages that had nowhere to go — a family who was not reached and does not know it. */
    undeliverableMessages: number;
}

/**
 * The one screen that answers "cum stăm?" — E21/S1.
 *
 * **Every number here is asked of whoever already owns the question.** Unmarked registers come from
 * `ClassSessionService.findUnmarkedSessions`, which the daily reminder also uses; arrears from
 * `ArrearsService.list`, which derives from succeeded payments; occupancy from
 * `EnrollmentService.occupancyOf`, which counts trials as seats (D7). Re-deriving any of them here
 * would create a second definition, and the second definition is always the one that drifts —
 * usually the one on the screen somebody glances at, precisely because nobody checks a glance.
 *
 * Read-only, and nothing here writes or schedules. It is four screens' worth of "who is stuck",
 * collapsed into one look.
 */
@Injectable()
export class OverviewService {
    constructor(
        @InjectRepository(Group) private readonly groupRepository: Repository<Group>,
        @InjectRepository(Project) private readonly projectRepository: Repository<Project>,
        @InjectRepository(User) private readonly userRepository: Repository<User>,
        @InjectRepository(OutboxMessage) private readonly outboxRepository: Repository<OutboxMessage>,
        private readonly classSessions: ClassSessionService,
        private readonly enrollments: EnrollmentService,
        private readonly arrears: ArrearsService,
    ) {}

    async build(today: Date = new Date()): Promise<Overview> {
        const date = toIsoDate(today);

        const [sessions, unmarked, arrearsRows, groupsNearlyFull, projectsAwaitingSend, pendingApprovals, undeliverableMessages] = await Promise.all([
            // The admin view of the day: `findSessions` narrows for a parent and not for an admin,
            // and this endpoint is admin-only, so it sees the whole school.
            this.classSessions.findSessions({ dateFrom: date, dateTo: date }, Role.ADMIN, 0),
            // The week behind today, today excluded: what is missing from the day in progress is
            // not a backlog, it is work still being done.
            this.classSessions.findUnmarkedSessions({ dateFrom: toIsoDate(addDays(today, -7)), dateTo: toIsoDate(addDays(today, -1)) }),
            this.arrears.list(today),
            this.nearlyFullGroups(),
            this.projectRepository.count({ where: { status: ProjectStatus.NEW } }),
            this.userRepository.count({ where: { role: Role.PARENT, approvalStatus: ApprovalStatus.PENDING } }),
            this.outboxRepository.count({ where: { status: OutboxStatus.UNDELIVERABLE } }),
        ]);

        const todaySessions: OverviewSession[] = sessions.map((session) => ({
            id: session.id,
            groupName: session.group?.name ?? 'Grupă necunoscută',
            startTime: session.startTime,
            endTime: session.endTime,
            locationName: session.room?.location?.name ?? null,
            marked: session.hasAttendance,
        }));

        return {
            date,
            today: {
                sessions: todaySessions,
                marked: todaySessions.filter((session) => session.marked).length,
                total: todaySessions.length,
            },
            unmarkedThisWeek: unmarked.length,
            arrears: {
                families: new Set(arrearsRows.map((row) => row.parentId)).size,
                outstanding: Math.round(arrearsRows.reduce((sum, row) => sum + row.outstanding, 0) * 100) / 100,
                over60: arrearsRows.filter((row) => row.bucket === 'over_60').length,
            },
            groupsNearlyFull,
            projectsAwaitingSend,
            pendingApprovals,
            undeliverableMessages,
        };
    }

    /**
     * Active groups with a seat or less left, fullest first.
     *
     * One `occupancyOf` per group rather than one clever query, because `occupancyOf` is where "a
     * seat is taken" is defined — trials count, which is D7 — and a query written here would be a
     * second answer to that. The school has a dozen groups; the cost is a dozen small counts once
     * per page load, and correctness is worth more than that.
     */
    private async nearlyFullGroups(): Promise<OverviewGroup[]> {
        const groups = await this.groupRepository.find({
            where: { isActive: true },
            relations: { room: { location: true } },
        });

        const rows: OverviewGroup[] = [];
        for (const group of groups) {
            const occupancy = await this.enrollments.occupancyOf(group.id);
            if (occupancy.free > 1) continue;
            rows.push({
                groupId: group.id,
                name: group.name,
                locationName: group.room?.location?.name ?? null,
                capacity: occupancy.capacity,
                taken: occupancy.taken,
                free: occupancy.free,
            });
        }
        return rows.sort((a, b) => a.free - b.free || a.name.localeCompare(b.name));
    }
}
