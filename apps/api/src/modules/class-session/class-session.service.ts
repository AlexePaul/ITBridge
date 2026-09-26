import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, EntityManager, MoreThanOrEqual, Not, Repository } from 'typeorm';
import { ClassSession } from 'src/entities/class-session.entity';
import { Group } from 'src/entities/group.entity';
import { Room } from 'src/entities/room.entity';
import { ClassSessionStatus } from 'src/enum/class-session-status.enum';
import { Role } from 'src/enum/role.enum';
import { CancelClassSessionDto } from './dto/cancelClassSession.dto';
import { MoveClassSessionDto } from './dto/moveClassSession.dto';
import { FilterClassSessionDto } from './dto/filterClassSession.dto';
import { GenerateClassSessionsDto } from './dto/generateClassSessions.dto';
import { UnmarkedClassSessionsDto } from './dto/unmarkedClassSessions.dto';
import { addDays, isoWeekday, occurrencesOf, parseIsoDate, startOfIsoWeek, startOfToday, toIsoDate } from './class-session.dates';
import { schoolDay, schoolLocalStamp } from 'src/common/school-clock';
import { romanianDayAndDate, romanianWeekdayName } from 'src/modules/mail/romanian-date';
import { Weekday } from 'src/enum/weekday.enum';
import { NonTeachingPeriodService } from './non-teaching-period.service';
import { ClassSessionNotifier } from './class-session-notifier';
import { ReplacementService } from 'src/modules/attendance/replacement.service';
import { EnrollmentService } from 'src/modules/enrollment/enrollment.service';
import { Invoice } from 'src/entities/invoice.entity';
import { SetVacationDto } from './dto/setVacation.dto';
import { teachingMonthOf } from 'src/modules/invoice/billing-period.rules';
import { lockInvoiceMonth } from 'src/modules/invoice/invoice-month-lock';

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
    /**
     * Weeks in the horizon that fall on a non-teaching day and were therefore never written —
     * E12/S2. Reported rather than silent: "generated 0" on a week of school holiday should read as
     * the calendar working, not as the generator failing.
     */
    skipped: number;
    sessions: ClassSession[];
}

@Injectable()
export class ClassSessionService {
    private readonly logger = new Logger(ClassSessionService.name);

    constructor(
        @InjectRepository(ClassSession) private readonly classSessionRepository: Repository<ClassSession>,
        @InjectRepository(Group) private readonly groupRepository: Repository<Group>,
        @InjectRepository(Room) private readonly roomRepository: Repository<Room>,
        // Only to ask "is this session's month already invoiced" — the one thing that freezes the
        // vacation tick (E12/S8). Issuing itself never runs from here.
        private readonly nonTeachingPeriodService: NonTeachingPeriodService,
        private readonly notifier: ClassSessionNotifier,
        private readonly replacements: ReplacementService,
        private readonly enrollments: EnrollmentService,
        private readonly dataSource: DataSource,
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
     * **Obeys the school calendar** (E12/S2): a week whose day falls inside a non-teaching period
     * is skipped rather than written, and counted in `skipped` so a short term is explained rather
     * than merely observed. Periods are matched per location, so a closure at one address leaves
     * the other's timetable alone.
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
        let skipped = 0;
        for (const group of groups) {
            const result = await this.generateForGroup(group, from, until);
            created.push(...result.created);
            existing += result.existing;
            skipped += result.skipped;
        }

        this.logger.log(
            `Generated ${created.length} class session(s) for ${groups.length} group(s) between ${toIsoDate(from)} and ${toIsoDate(addDays(until, -1))}; ` +
                `${existing} already existed, ${skipped} skipped as non-teaching days.`,
        );

        return {
            from: toIsoDate(from),
            to: toIsoDate(addDays(until, -1)),
            groups: groups.length,
            created: created.length,
            existing,
            skipped,
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
     * The reason goes into `notes`, appended rather than substituted: there is no
     * `cancellationReason` column, and E12/S5 decided against adding one — the reason is read by a
     * person in the timetable and quoted once in the email, and both already have it here.
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

        // The write, the note to the families and the release of any child moved into the class are
        // one unit of work — E12/S5. A class that is off with nobody told is the failure the outbox
        // exists to prevent, and a family told about a cancellation that then rolled back is worse
        // than either.
        return this.dataSource.transaction(async (manager) => {
            const saved = await manager.getRepository(ClassSession).save(session);
            // Notify before releasing: the notifier reads the placements to find the visiting
            // families, and a cleared one is a family it can no longer see.
            await this.notifier.notifyCancelled(id, dto.reason, manager);
            await this.replacements.clearOn(id, manager);
            return saved;
        });
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
    /**
     * Moves one class: another day, another hour, another room — any of them — E12/S5.
     *
     * An edit of the row, not a new row: there is no "moved" status by decision, the register stays
     * attached, and the timetable simply tells the truth about where the class now is. What it
     * refuses, in the order checked:
     *
     * - a cancelled class (reinstate it first — moving it would hide the cancellation);
     * - a class already taught (it has marks; the class happened at the old time, and moving it
     *   would rewrite history under the register);
     * - a move that names no target field — that is a mistyped request, not a no-op;
     * - a target day the school calendar closes: the move must obey S2 exactly as generation does,
     *   or the calendar would have a side door;
     * - a target day where the group already has a class (`UQ_class_sessions_group_date` would
     *   refuse anyway; checking first turns the driver error into a sentence);
     * - a target room already taken at that hour by another live class.
     */
    async moveSession(id: number, dto: MoveClassSessionDto): Promise<ClassSession> {
        const session = await this.classSessionRepository.findOne({
            where: { id },
            relations: { group: { room: { location: true } }, room: { location: true }, attendances: true },
        });
        if (!session) {
            throw new NotFoundException('Class session not found');
        }
        if (session.status === ClassSessionStatus.CANCELLED) {
            throw new ConflictException({
                message: 'Ședința e anulată — reactiveaz-o înainte s-o muți.',
                error: 'CLASS_SESSION_CANCELLED',
            });
        }
        if (session.attendances.length > 0) {
            throw new ConflictException({
                message: 'Ședința are deja prezențe înregistrate, deci s-a ținut — nu mai poate fi mutată.',
                error: 'CLASS_SESSION_HAS_ATTENDANCE',
            });
        }
        if (dto.date === undefined && dto.startTime === undefined && dto.endTime === undefined && dto.roomId === undefined) {
            throw new BadRequestException({
                message: 'Mutarea nu schimbă nimic — alege o zi, o oră sau o sală.',
                error: 'MOVE_CHANGES_NOTHING',
            });
        }

        const targetDate = dto.date === undefined ? toIsoDate(session.date) : toIsoDate(parseIsoDate(dto.date));
        const targetStart = dto.startTime === undefined ? session.startTime.slice(0, 5) : dto.startTime;
        const targetEnd = dto.endTime === undefined ? session.endTime.slice(0, 5) : dto.endTime;
        if (targetEnd <= targetStart) {
            throw new BadRequestException({
                message: 'Ora de sfârșit este înaintea celei de început.',
                error: 'SESSION_ENDS_BEFORE_IT_STARTS',
            });
        }
        // Not into the past, on the school's clock: a class moved to a day gone by is one nobody can
        // come to, and the families were told so — the QA of 26 September 2026 moved a 6 October
        // class to 24 September and mailed „se mută pe 24 septembrie", leaving the week with two.
        if (`${targetDate}T${targetStart}` < schoolLocalStamp(new Date())) {
            throw new BadRequestException({
                message: 'Ora nu se poate muta într-un moment care a trecut.',
                error: 'CLASS_SESSION_MOVED_INTO_PAST',
            });
        }

        let targetRoom = session.room;
        if (dto.roomId !== undefined && dto.roomId !== session.room.id) {
            const room = await this.roomRepository.findOne({ where: { id: dto.roomId }, relations: { location: true } });
            if (!room) {
                throw new NotFoundException('Room not found');
            }
            targetRoom = room;
        }
        const roomChanged = targetRoom.id !== session.room.id;

        // The move obeys the school calendar exactly as generation does — otherwise the calendar
        // has a side door, and a class moved into the winter break shows up on a day the whole
        // school knows is off.
        const targetDay = parseIsoDate(targetDate);
        const closed = await this.nonTeachingPeriodService.datesIn(targetDay, addDays(targetDay, 1), targetRoom.location?.id ?? null);
        if (closed.has(targetDate)) {
            throw new ConflictException({
                message: `Pe ${romanianDayAndDate(targetDate)} nu se ține curs — ziua e în calendarul școlar.`,
                error: 'MOVED_ONTO_NON_TEACHING_DAY',
            });
        }

        if (targetDate !== toIsoDate(session.date)) {
            const sameDay = await this.classSessionRepository.findOne({
                where: { group: { id: session.group.id }, date: targetDay },
            });
            if (sameDay) {
                throw new ConflictException({
                    message: `Grupa are deja o ședință pe ${romanianDayAndDate(targetDate)}.`,
                    error: 'GROUP_ALREADY_HAS_SESSION_THAT_DAY',
                });
            }
        }

        // A live class already in the target room at an overlapping hour. Cancelled ones do not
        // count — their room is free in fact, whatever the row says.
        const clash = await this.classSessionRepository
            .createQueryBuilder('session')
            .leftJoin('session.room', 'room')
            .andWhere('room.id = :roomId', { roomId: targetRoom.id })
            .andWhere('session.date = :date', { date: targetDate })
            .andWhere('session.id != :id', { id })
            .andWhere('session.status != :cancelled', { cancelled: ClassSessionStatus.CANCELLED })
            .andWhere('session.startTime < :end AND :start < session.endTime', { start: targetStart, end: targetEnd })
            .getOne();
        if (clash) {
            throw new ConflictException({
                message: `Sala e ocupată atunci de altă ședință (${clash.startTime.slice(0, 5)}–${clash.endTime.slice(0, 5)}).`,
                error: 'ROOM_BUSY_AT_THAT_TIME',
            });
        }

        // Where it was, captured before the row is overwritten: the message tells a parent both
        // halves, and afterwards only the note remembers the first one.
        const from = {
            date: toIsoDate(session.date),
            startTime: session.startTime,
            roomName: session.room.name,
            locationName: session.room.location?.name ?? '',
        };

        // The note keeps where the class used to be, because that is the question a parent asks.
        const note = `Mutată (de pe ${romanianDayAndDate(session.date)}, ${session.startTime.slice(0, 5)}): ${dto.reason}`;
        session.notes = session.notes === null || session.notes.trim() === '' ? note : `${session.notes}\n\n${note}`;
        session.date = targetDay;
        session.startTime = `${targetStart}:00`;
        session.endTime = `${targetEnd}:00`;
        session.room = targetRoom;

        return this.dataSource.transaction(async (manager) => {
            // A class going into another room has to fit in it, counted behind the group's lock —
            // the one a booking or a placement takes before counting this same class. Checked before
            // the lock, a trial booked in between would sit in a room already too small for it.
            if (roomChanged) {
                await this.enrollments.lockGroup(manager, session.group.id);
                await this.assertRoomHolds(session, targetRoom, manager);
            }
            const saved = await manager.getRepository(ClassSession).save(session);
            await this.notifier.notifyMoved(id, from, dto.reason, manager);
            return saved;
        });
    }

    /**
     * Marks a class as held in a school holiday, or takes the mark off — E12/S8.
     *
     * A fact about the hour, put there by whoever took the register. It tells nobody anything: no
     * message goes to the families, because nothing about the timetable changed — the class was
     * on, it was taught, the register exists. What changes is what the hour is worth on the
     * invoice (E15/S9: only to the children marked present), and that is why the two refusals are
     * what they are:
     *
     * - **a cancelled session** cannot be a vacation one — an hour that did not happen was not
     *   held in anything;
     * - **a session whose teaching month is already invoiced** cannot change — the tick would
     *   retroactively alter what a family was billed, and that correction is a conversation about
     *   an invoice, not a flag on a row. Before issuing, the tick is as reversible as any mark.
     *
     * Idempotent: setting what is already set is a save that changes nothing, not an error.
     */
    async setVacation(id: number, dto: SetVacationDto): Promise<ClassSession> {
        const session = await this.classSessionRepository.findOne({
            where: { id },
            relations: { group: true, room: { location: true } },
        });
        if (!session) {
            throw new NotFoundException('Class session not found');
        }
        if (session.status === ClassSessionStatus.CANCELLED) {
            throw new ConflictException({
                message: 'Ședința e anulată — o oră care nu se ține nu poate fi „de vacanță".',
                error: 'CLASS_SESSION_CANCELLED',
            });
        }

        // The teaching month, not the calendar one: a session on Friday 4 September belongs to
        // August if its Monday did, and August is the invoice it would be changing.
        const month = teachingMonthOf(session.date);
        await this.dataSource.transaction(async (manager) => {
            // Behind the month's lock, like every other writer of what a month's invoice is made of
            // (the review of 25 September 2026): an issue in the same second has either committed —
            // and this refuses — or waits, and then reads the tick.
            await lockInvoiceMonth(manager, month);
            const invoiced = await manager.count(Invoice, { where: { monthIssued: month } });
            if (invoiced > 0) {
                throw new ConflictException({
                    message: `Luna ${month} e deja facturată — bifa nu se mai poate schimba.`,
                    error: 'MONTH_ALREADY_INVOICED',
                });
            }
            // The tick and nothing else, and only while the class is still on. A save of the row read
            // above wrote every column back as it was read, so a cancellation or a move committed in
            // between was quietly undone.
            const ticked = await manager.update(ClassSession, { id, status: Not(ClassSessionStatus.CANCELLED) }, { isVacation: dto.isVacation });
            if (!ticked.affected) {
                throw new ConflictException({
                    message: 'Ședința e anulată — o oră care nu se ține nu poate fi „de vacanță".',
                    error: 'CLASS_SESSION_CANCELLED',
                });
            }
        });

        session.isVacation = dto.isVacation;
        return session;
    }

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

        // The families were told the class was off, so they have to be told it is on. Without this
        // half, reinstating is a change only the school can see, and an empty classroom is the
        // result.
        return this.dataSource.transaction(async (manager) => {
            const saved = await manager.getRepository(ClassSession).save(session);
            await this.notifier.notifyReinstated(id, manager);
            return saved;
        });
    }

    /**
     * The group moved to another day, hour or room, and its coming classes follow it — the review
     * of 25 September 2026.
     *
     * The edit used to change the group and nothing else: eight weeks of classes stayed on the old
     * day, and the next morning's generation wrote eight more on the new one — each phantom sold on
     * `/proba`, offered for replacements and reported unmarked. Now each class still where the
     * generator put it (on its slot, at the old hour, in the old room, not taught, not cancelled)
     * moves **within its own week** to the group's new day, hour and room. A week's class stays that
     * week's class, and the month it is billed to is the month of its Monday (E15/S9).
     *
     * What stays put, and why:
     * - a class the office moved by hand — it was put there on purpose;
     * - a class already taught or cancelled — the first happened, the second was called off;
     * - a class whose new day has passed, is closed by the calendar, or already holds another class
     *   of the group — the change takes effect in the weeks it can.
     *
     * Every one of them still hands its week's slot to the new day, so the generation that follows
     * does not write a second class beside it. The families hear once, in this transaction.
     *
     * `group` carries the new values, with `room.location` loaded; `before` is where it was.
     */
    async followGroup(
        group: Group,
        before: { weekday: Weekday; startTime: string; endTime: string; room: Room },
        manager: EntityManager,
    ): Promise<{ moved: number; kept: number; created: number }> {
        const repository = manager.getRepository(ClassSession);
        const tomorrow = addDays(parseIsoDate(schoolDay(new Date())), 1);
        const future = await repository.find({
            where: { group: { id: group.id }, date: MoreThanOrEqual(tomorrow) },
            relations: { room: true, attendances: true },
            order: { date: 'ASC' },
        });

        const occupiedDays = new Set(future.map((row) => toIsoDate(row.date)));
        const occupiedSlots = new Set(future.flatMap((row) => (row.scheduledFor ? [toIsoDate(row.scheduledFor)] : [])));
        const horizonEnd = future.length > 0 ? addDays(parseIsoDate(toIsoDate(future[future.length - 1].date)), 7) : addDays(tomorrow, 7);
        const closed = await this.nonTeachingPeriodService.datesIn(tomorrow, horizonEnd, group.room?.location?.id ?? null);

        const movedTo: Date[] = [];
        let kept = 0;
        for (const row of future) {
            if (!row.scheduledFor) continue;
            const slot = toIsoDate(row.scheduledFor);
            if (slot < toIsoDate(tomorrow) || isoWeekday(parseIsoDate(slot)) !== before.weekday) continue;

            const newDay = addDays(startOfIsoWeek(parseIsoDate(slot)), group.weekday - 1);
            const newSlot = toIsoDate(newDay);
            if (newDay.getTime() < tomorrow.getTime() || (newSlot !== slot && occupiedSlots.has(newSlot))) {
                kept += 1;
                continue;
            }

            const whereGenerated =
                toIsoDate(row.date) === slot &&
                sameTime(row.startTime, before.startTime) &&
                sameTime(row.endTime, before.endTime) &&
                row.room?.id === before.room.id;
            const movable =
                whereGenerated &&
                row.status === ClassSessionStatus.SCHEDULED &&
                row.attendances.length === 0 &&
                !closed.has(newSlot) &&
                (newSlot === slot || !occupiedDays.has(newSlot));

            occupiedSlots.delete(slot);
            occupiedSlots.add(newSlot);
            if (movable) {
                occupiedDays.delete(slot);
                occupiedDays.add(newSlot);
                await repository.update(row.id, {
                    date: newDay,
                    scheduledFor: newDay,
                    startTime: group.startTime,
                    endTime: group.endTime,
                    room: { id: group.room.id },
                });
                movedTo.push(newDay);
            } else {
                await repository.update(row.id, { scheduledFor: newDay });
                kept += 1;
            }
        }

        // Weeks with no class at all — a closure on the old day, a horizon the old day ran out of —
        // get one on the new day now, rather than at 04:30 tomorrow.
        const created = group.isActive
            ? (await this.generateForGroup(group, tomorrow, addDays(tomorrow, DEFAULT_HORIZON_WEEKS * 7), manager)).created.length
            : 0;

        if (movedTo.length > 0) {
            const slotText = (weekday: Weekday, start: string, end: string, room: Room) =>
                `${romanianWeekdayName(weekday)}, ${start.slice(0, 5)}–${end.slice(0, 5)}, ${room.location?.name ? `${room.name} — ${room.location.name}` : room.name}`;
            await this.notifier.notifyGroupScheduleChanged(
                group.id,
                {
                    fromSlot: slotText(before.weekday, before.startTime, before.endTime, before.room),
                    toSlot: slotText(group.weekday, group.startTime, group.endTime, group.room),
                    firstDate: movedTo[0],
                },
                manager,
            );
        }

        this.logger.log(`Group ${group.id} changed its slot: ${movedTo.length} class(es) followed, ${kept} kept where they were, ${created} written.`);
        return { moved: movedTo.length, kept, created };
    }

    /**
     * A class moved into another room has to fit in it — the review of 25 September 2026. The move
     * checked that the room was free at that hour and nothing about its size, so a group of eight
     * went into a room of two, and the per-class count, now reading the room, would have been the
     * only thing to notice.
     */
    async assertRoomHolds(session: { id: number; group: { id: number } }, room: Room, manager?: EntityManager): Promise<void> {
        const expected = await this.enrollments.expectedAt(session, manager);
        if (expected > room.capacity) {
            throw new ConflictException({
                message: `Sala „${room.name}" are ${room.capacity} locuri, iar la ora asta vin ${expected} copii.`,
                error: 'ROOM_TOO_SMALL',
            });
        }
    }

    private async findGroupsToGenerateFor(groupId?: number): Promise<Group[]> {
        // The room comes along because it is copied onto every session generated below, and its
        // location because the school calendar is asked per location: a period declared for one
        // address must not empty the other one's timetable. Without `room.location` loaded, every
        // group read as location-less and every local closure applied to the whole school —
        // silently, since the sessions it removed simply never appeared.
        const relations = { room: { location: true } };

        if (groupId === undefined) {
            return this.groupRepository.find({ where: { isActive: true }, relations });
        }

        const group = await this.groupRepository.findOne({ where: { id: groupId }, relations });
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

    private async generateForGroup(
        group: Group,
        from: Date,
        until: Date,
        manager?: EntityManager,
    ): Promise<{ created: ClassSession[]; existing: number; skipped: number }> {
        const repository = manager ? manager.getRepository(ClassSession) : this.classSessionRepository;
        const everyWeek = occurrencesOf(group.weekday, from, until);
        if (everyWeek.length === 0) {
            return { created: [], existing: 0, skipped: 0 };
        }

        // E12/S2: the school year has holidays in it, and until this existed the generator wrote
        // classes straight through the winter break for somebody to cancel by hand every December.
        // Asked per group, because a period can be limited to one location and a group's location
        // is a consequence of its room.
        const closed = await this.nonTeachingPeriodService.datesIn(from, until, group.room?.location?.id ?? null);
        const wanted = everyWeek.filter((date) => !closed.has(toIsoDate(date)));
        const skipped = everyWeek.length - wanted.length;

        if (wanted.length === 0) {
            return { created: [], existing: 0, skipped };
        }

        // A day is taken twice over: a class is on it, or a class was **generated for it** and moved
        // somewhere else (`scheduledFor`). The second is the review of 25 September 2026 — asking
        // about the day alone, a class moved from Friday to Saturday left Friday free, and the next
        // morning's run wrote Friday again: two classes that week, and the phantom one sold on
        // `/proba`, offered for replacements and reported unmarked.
        const window = Between(from, addDays(until, -1));
        const known = await repository.find({
            where: [
                { group: { id: group.id }, date: window },
                { group: { id: group.id }, scheduledFor: window },
            ],
        });
        // The driver hands back a `date` column as a string while the entity declares `Date`, so
        // both forms go through `toIsoDate` before anything is compared. Comparing them raw is how
        // an idempotent generator quietly stops being idempotent.
        const taken = new Set(known.flatMap((session) => [toIsoDate(session.date), ...(session.scheduledFor ? [toIsoDate(session.scheduledFor)] : [])]));
        const missing = wanted.filter((date) => !taken.has(toIsoDate(date)));
        if (missing.length === 0) {
            return { created: [], existing: wanted.length, skipped };
        }

        const rows = missing.map((date) =>
            repository.create({
                group,
                // Copied, not read through `group.room` at display time. Moving a group to another
                // room changes where its future classes are, not where the past ones were.
                room: group.room,
                date,
                scheduledFor: date,
                startTime: group.startTime,
                endTime: group.endTime,
                status: ClassSessionStatus.SCHEDULED,
                notes: null,
            }),
        );
        const created = await repository.save(rows);
        return { created, existing: wanted.length - missing.length, skipped };
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

/** `16:00` and `16:00:00` are the same hour: the column hands back seconds, a DTO often does not. */
function sameTime(one: string, other: string): boolean {
    return one.slice(0, 5) === other.slice(0, 5);
}
