import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { ClassSession } from 'src/entities/class-session.entity';
import { Group } from 'src/entities/group.entity';
import { ClassSessionStatus } from 'src/enum/class-session-status.enum';
import { Role } from 'src/enum/role.enum';
import { CancelClassSessionDto } from './dto/cancelClassSession.dto';
import { FilterClassSessionDto } from './dto/filterClassSession.dto';
import { GenerateClassSessionsDto } from './dto/generateClassSessions.dto';
import { UnmarkedClassSessionsDto } from './dto/unmarkedClassSessions.dto';
import { addDays, occurrencesOf, parseIsoDate, startOfToday, toIsoDate } from './class-session.dates';

/** The rolling horizon from E12/S1: eight weeks of timetable, always. */
export const DEFAULT_HORIZON_WEEKS = 8;

/**
 * A session plus the one thing the timetable screen cannot work out on its own: whether anybody
 * took the register. `attendances` is dropped rather than sent — the list is a schedule, not a
 * report on individual children, and shipping every mark on every row would make it one.
 */
export type ClassSessionListItem = Omit<ClassSession, 'attendances'> & { hasAttendance: boolean };

export interface GenerateClassSessionsResult {
    /** First and last day of the horizon, both inclusive — what the caller actually asked for. */
    from: string;
    to: string;
    /** How many groups were considered, which is 1 for a targeted run. */
    groups: number;
    created: number;
    /** Sessions the horizon wanted that were already there. On a second run this is everything. */
    existing: number;
    sessions: ClassSession[];
}

@Injectable()
export class ClassSessionService {
    private readonly logger = new Logger(ClassSessionService.name);

    constructor(
        @InjectRepository(ClassSession) private readonly classSessionRepository: Repository<ClassSession>,
        @InjectRepository(Group) private readonly groupRepository: Repository<Group>,
    ) {}

    /**
     * Writes the next N weeks of timetable for one group or for every active one.
     *
     * Idempotent by (group, date): a session that already exists is counted and left completely
     * alone, whatever state it is in. That is the important half of the rule — re-running must not
     * resurrect a class somebody cancelled, or move one somebody moved. `UQ_class_sessions_group_date`
     * is what actually guarantees it; the read below is only what turns a collision into a number in
     * the response instead of a 409. Two generations racing each other therefore end in a conflict
     * rather than a doubled timetable, which is the failure worth having.
     *
     * **There is no holiday calendar.** E12/S2 is not built, so sessions are written on every week
     * in the horizon, school holidays included, and one that falls in a holiday is cancelled by
     * hand. Stated here rather than left to be discovered in December.
     */
    async generateSessions(dto: GenerateClassSessionsDto): Promise<GenerateClassSessionsResult> {
        const weeks = dto.weeks ?? DEFAULT_HORIZON_WEEKS;
        const from = dto.from === undefined ? startOfToday() : parseIsoDate(dto.from);
        // Half-open: `until` is the first day *after* the horizon, so N weeks is N * 7 days and
        // contains exactly N of any given weekday.
        const until = addDays(from, weeks * 7);

        const groups = await this.findGroupsToGenerateFor(dto.groupId);

        const created: ClassSession[] = [];
        let existing = 0;
        for (const group of groups) {
            const result = await this.generateForGroup(group, from, until);
            created.push(...result.created);
            existing += result.existing;
        }

        this.logger.log(
            `Generated ${created.length} class session(s) for ${groups.length} group(s) between ${toIsoDate(from)} and ${toIsoDate(addDays(until, -1))}; ` +
                `${existing} already existed.`,
        );

        return {
            from: toIsoDate(from),
            to: toIsoDate(addDays(until, -1)),
            groups: groups.length,
            created: created.length,
            existing,
            sessions: created,
        };
    }

    /**
     * The timetable, filtered. Both ends of the interval are inclusive, because a caller asking for
     * `2026-09-01`..`2026-09-30` means September, not September minus the last day.
     *
     * An admin gets the whole school. A parent gets only the groups their own children are in —
     * narrowed here, in the service, because the guard cannot express "the rows that belong to
     * you". Without the narrowing this endpoint hands any authenticated parent the schedule of
     * every group in the school, which is when and where other people's children are on a Tuesday.
     */
    async findSessions(filters: FilterClassSessionDto, role: Role, userId: number): Promise<ClassSessionListItem[]> {
        this.assertInterval(filters.dateFrom, filters.dateTo);

        const qb = this.classSessionRepository
            .createQueryBuilder('session')
            .leftJoinAndSelect('session.group', 'group')
            .leftJoinAndSelect('session.room', 'room')
            .leftJoinAndSelect('room.location', 'location')
            // A separate count query rather than joining the marks in: a join would multiply the
            // session rows by the size of the group, and every one of those rows would be sent.
            .loadRelationCountAndMap('session.attendanceCount', 'session.attendances')
            .orderBy('session.date', 'ASC')
            .addOrderBy('session.startTime', 'ASC');

        if (role !== Role.ADMIN) {
            // Session → group → the children enrolled in it → their profile → the account. Three
            // joins rather than the usual one because a session has no parent of its own; the group
            // is what a family is attached to.
            //
            // `leftJoin`, not `leftJoinAndSelect`: the children select no columns, so the fan-out
            // over a group of ten adds ten identical raw rows per session and `getMany` folds them
            // back into one entity by id. Selecting them would both ship the roster of every group
            // to a parent and make the fold impossible.
            //
            // `andWhere` throughout, never `where` — a `where` further down this method would drop
            // this restriction silently and give the parent the whole school back.
            qb.leftJoin('group.children', 'child').leftJoin('child.parent', 'parent').leftJoin('parent.user', 'user');
            qb.andWhere('user.id = :userId', { userId });
        }

        if (filters.groupId !== undefined) {
            qb.andWhere('group.id = :groupId', { groupId: filters.groupId });
        }
        if (filters.dateFrom !== undefined) {
            qb.andWhere('session.date >= :dateFrom', { dateFrom: filters.dateFrom });
        }
        if (filters.dateTo !== undefined) {
            qb.andWhere('session.date <= :dateTo', { dateTo: filters.dateTo });
        }
        if (filters.status !== undefined) {
            qb.andWhere('session.status = :status', { status: filters.status });
        }

        const rows = (await qb.getMany()) as (ClassSession & { attendanceCount?: number })[];
        return rows.map((row) => {
            const { attendanceCount, attendances: _attendances, ...session } = row;
            return { ...session, hasAttendance: (attendanceCount ?? 0) > 0 };
        });
    }

    /**
     * Sessions in the interval that were supposed to happen and that nobody marked.
     *
     * Two conditions, and both matter:
     *
     * - **no attendance rows at all**, expressed as a left join with `attendance.id IS NULL` rather
     *   than a count, so Postgres can stop at the first mark it finds;
     * - **status `scheduled`**, which is what keeps a cancelled class out of the list. A cancelled
     *   class has no register to take, so reporting it as unmarked would be reporting a task that
     *   does not exist — and a daily reminder that names things nobody has to do is a daily reminder
     *   people stop reading. It keeps `held` out too, for the same reason in reverse.
     *
     * Shared by the timetable screen and by the daily job, on purpose: two definitions of "unmarked"
     * would drift, and the one the reminder email uses is the one that has to be right.
     */
    async findUnmarkedSessions(range: UnmarkedClassSessionsDto): Promise<ClassSession[]> {
        this.assertInterval(range.dateFrom, range.dateTo);

        return this.classSessionRepository
            .createQueryBuilder('session')
            .leftJoinAndSelect('session.group', 'group')
            .leftJoinAndSelect('session.room', 'room')
            .leftJoinAndSelect('room.location', 'location')
            .leftJoin('session.attendances', 'attendance')
            .andWhere('attendance.id IS NULL')
            .andWhere('session.status = :status', { status: ClassSessionStatus.SCHEDULED })
            .andWhere('session.date >= :dateFrom', { dateFrom: range.dateFrom })
            .andWhere('session.date <= :dateTo', { dateTo: range.dateTo })
            .orderBy('session.date', 'ASC')
            .addOrderBy('session.startTime', 'ASC')
            .getMany();
    }

    /**
     * Calls off one class, with the reason.
     *
     * The reason goes into `notes`, appended rather than substituted, because there is no
     * `cancellationReason` column and adding one is a migration this story does not own. When E12/S5
     * arrives — notify the group, grant the make-up rights — it will want the reason as a field of
     * its own, and that is the moment to split it out.
     */
    async cancelSession(id: number, dto: CancelClassSessionDto): Promise<ClassSession> {
        const session = await this.classSessionRepository.findOne({
            where: { id },
            relations: { group: { room: { location: true } }, room: { location: true }, attendances: true },
        });
        if (!session) {
            throw new NotFoundException('Class session not found');
        }
        if (session.status === ClassSessionStatus.CANCELLED) {
            throw new ConflictException({
                message: 'This class session is already cancelled',
                error: 'CLASS_SESSION_ALREADY_CANCELLED',
            });
        }
        // A class with marks against it happened, whatever the status column says. Cancelling it
        // would leave attendance attached to a class that officially never took place — and the
        // unmarked report, which trusts the status, would then be quietly wrong about it.
        if (session.attendances.length > 0) {
            throw new ConflictException({
                message: 'This class session already has attendance recorded and cannot be cancelled',
                error: 'CLASS_SESSION_HAS_ATTENDANCE',
            });
        }

        // Romanian: `notes` is displayed verbatim in the timetable, and the reason an admin typed is
        // Romanian already. The same wording the backfill migration writes.
        const reason = `Anulată: ${dto.reason}`;
        session.notes = session.notes === null || session.notes.trim() === '' ? reason : `${session.notes}\n\n${reason}`;
        session.status = ClassSessionStatus.CANCELLED;
        return this.classSessionRepository.save(session);
    }

    /**
     * Undoes a cancellation, for the class that was cancelled by mistake or taught anyway.
     *
     * Without this the mistake is a dead end: attendance refuses a cancelled session, and
     * generation is idempotent so it will not resurrect one either. The admin would be left with a
     * class that happened, no way to record who was there, and no way to say so.
     *
     * The status goes back to `scheduled` rather than `held`, because reinstating says the class
     * exists again, not that anyone has yet confirmed it took place — that is what marking the
     * register is for. The cancellation note is kept: the timetable should still show that this day
     * was called off and then put back, since that is exactly the sequence a parent will ask about.
     */
    async reinstateSession(id: number): Promise<ClassSession> {
        const session = await this.classSessionRepository.findOne({
            where: { id },
            relations: { group: { room: { location: true } }, room: { location: true } },
        });
        if (!session) {
            throw new NotFoundException('Class session not found');
        }
        if (session.status !== ClassSessionStatus.CANCELLED) {
            throw new ConflictException({
                message: 'This class session is not cancelled, so there is nothing to reinstate',
                error: 'CLASS_SESSION_NOT_CANCELLED',
            });
        }

        const note = 'Reactivată.';
        session.notes = session.notes === null || session.notes.trim() === '' ? note : `${session.notes}\n\n${note}`;
        session.status = ClassSessionStatus.SCHEDULED;
        return this.classSessionRepository.save(session);
    }

    private async findGroupsToGenerateFor(groupId?: number): Promise<Group[]> {
        if (groupId === undefined) {
            // The room comes along because it is copied onto every session generated below.
            return this.groupRepository.find({ where: { isActive: true }, relations: { room: true } });
        }

        const group = await this.groupRepository.findOne({ where: { id: groupId }, relations: { room: true } });
        if (!group) {
            throw new NotFoundException('Group not found');
        }
        // Refusing beats generating quietly: an inactive group is one that is not being taught, and
        // filling eight weeks of timetable for it would put classes on a screen that nobody holds.
        // Reactivate it first — then this call does what the caller meant.
        if (!group.isActive) {
            throw new ConflictException({
                message: `Group "${group.name}" is inactive; reactivate it before generating its timetable`,
                error: 'GROUP_INACTIVE',
            });
        }
        return [group];
    }

    private async generateForGroup(group: Group, from: Date, until: Date): Promise<{ created: ClassSession[]; existing: number }> {
        const wanted = occurrencesOf(group.weekday, from, until);
        if (wanted.length === 0) {
            return { created: [], existing: 0 };
        }

        const known = await this.classSessionRepository.find({
            where: { group: { id: group.id }, date: Between(from, addDays(until, -1)) },
        });
        // The driver hands back a `date` column as a string while the entity declares `Date`, so
        // both forms go through `toIsoDate` before anything is compared. Comparing them raw is how
        // an idempotent generator quietly stops being idempotent.
        const taken = new Set(known.map((session) => toIsoDate(session.date)));
        const missing = wanted.filter((date) => !taken.has(toIsoDate(date)));
        if (missing.length === 0) {
            return { created: [], existing: wanted.length };
        }

        const rows = missing.map((date) =>
            this.classSessionRepository.create({
                group,
                // Copied, not read through `group.room` at display time. Moving a group to another
                // room changes where its future classes are, not where the past ones were.
                room: group.room,
                date,
                startTime: group.startTime,
                endTime: group.endTime,
                status: ClassSessionStatus.SCHEDULED,
                notes: null,
            }),
        );
        const created = await this.classSessionRepository.save(rows);
        return { created, existing: wanted.length - missing.length };
    }

    /**
     * Both ends parsed, and the order checked.
     *
     * Parsing is not redundant with the DTO's pattern: `2026-02-30` matches the pattern and is not a
     * day, and passing it through to Postgres turns a bad request into a 500. And a reversed
     * interval matches nothing, which on the unmarked report looks exactly like "all clear" — the
     * one wrong answer that reads as good news.
     */
    private assertInterval(dateFrom?: string, dateTo?: string): void {
        const from = dateFrom === undefined ? undefined : parseIsoDate(dateFrom);
        const to = dateTo === undefined ? undefined : parseIsoDate(dateTo);
        if (from !== undefined && to !== undefined && from.getTime() > to.getTime()) {
            throw new BadRequestException(`dateFrom (${dateFrom}) is after dateTo (${dateTo})`);
        }
    }
}
