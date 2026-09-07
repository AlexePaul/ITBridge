import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, DataSource, Repository } from 'typeorm';
import { ClassSession } from 'src/entities/class-session.entity';
import { Group } from 'src/entities/group.entity';
import { Room } from 'src/entities/room.entity';
import { ClassSessionStatus } from 'src/enum/class-session-status.enum';
import { schoolLocalStamp } from 'src/common/school-clock';
import { romanianWeekdayName } from 'src/modules/mail/romanian-date';
import { addDays, isoWeekday, isoWeekOf, parseIsoDate, toIsoDate } from './class-session.dates';
import { ClassSessionNotifier, SessionPlacement } from './class-session-notifier';
import { NonTeachingPeriodService } from './non-teaching-period.service';
import { RescheduleClassSessionDto } from './dto/rescheduleClassSession.dto';
import { RescheduleWindowsDto } from './dto/rescheduleWindows.dto';
import { buildRescheduleWindows, BusySlot, hhmm, isInWeek, minutesBetween, RescheduleWindow, Week, WindowRoom } from './reschedule.rules';

/** The row on the missed day, as the screen needs to describe it. `HH:mm` throughout. */
export interface RescheduleSource {
    id: number;
    status: `${ClassSessionStatus}`;
    hasAttendance: boolean;
    startTime: string;
    endTime: string;
    roomId: number;
    roomName: string;
    notes: string | null;
}

/** Why the class cannot be recovered at all — the same code the write would refuse with. */
export interface RescheduleBlock {
    code: 'CLASS_SESSION_HAS_ATTENDANCE' | 'CLASS_SESSION_NOT_FOUND' | 'GROUP_ALREADY_HAS_SESSION_THAT_WEEK';
    message: string;
}

export interface RescheduleWindowsResult {
    week: Week;
    /** The day the class was, or would have been, on. */
    missedDate: string;
    /** Whether the school calendar closes that day at the group's location — the usual reason there is nothing to hold. */
    missedDayClosed: boolean;
    /** The group's own hour and room, `HH:mm` — what the class defaults to if only the day changes. */
    usual: { startTime: string; endTime: string; roomId: number; roomName: string };
    /** The row on that day, or `null` when generation never wrote one. */
    source: RescheduleSource | null;
    blocked: RescheduleBlock | null;
    /** Empty when blocked, and empty when the week has nothing free — the screen says which. */
    windows: RescheduleWindow[];
}

/**
 * Recovering a class that cannot be held — E12/S9.
 *
 * S5's `moveSession` is an edit of a row that exists and is on. The class this story starts from
 * is often neither: a Monday that is a public holiday was written into the calendar (S2), so the
 * generator skipped the day and there is **no row**; or the holiday was added after generation, and
 * the row is **cancelled**. Moving through S5 would mean reinstating first — a message to every
 * family saying the class is on, on a day the whole country has off, followed a minute later by one
 * saying it moved. So the act here is keyed on the **group and the day**, which both states share,
 * and it writes the week's one row wherever it has to: edited if it exists, created if it does not,
 * never a cancelled row plus a new one.
 *
 * What it refuses is what a move refuses, plus the week: a class recovered in another week would
 * change the month it is billed to (E15/S9 — a week belongs to the month of its Monday), and the
 * rule everywhere in this epic is that a week's hour is made up inside that week or not at all.
 *
 * The families hear exactly once, through `class-moved`, which says where the class was and where
 * it now is. Cancelling, reinstating and the like are not what happened to them; a move is.
 */
@Injectable()
export class RescheduleService {
    private readonly logger = new Logger(RescheduleService.name);

    constructor(
        @InjectRepository(ClassSession) private readonly classSessionRepository: Repository<ClassSession>,
        @InjectRepository(Group) private readonly groupRepository: Repository<Group>,
        @InjectRepository(Room) private readonly roomRepository: Repository<Room>,
        private readonly nonTeachingPeriodService: NonTeachingPeriodService,
        private readonly notifier: ClassSessionNotifier,
        private readonly dataSource: DataSource,
    ) {}

    /**
     * The free slots in the missed class's week, and the state of the class itself.
     *
     * "Free" is built from facts the office thinks in: the days the calendar leaves open, the hours
     * this location actually teaches at (every active group's start time — the school's own grid,
     * not every half hour of the day), and the rooms at the group's address, its own first. A room
     * at the other address is not offered: the families were told a place when they enrolled, and a
     * recovered hour across town is a different conversation.
     *
     * `blocked` says up front what the write would refuse, so the screen can say "s-a ținut" instead
     * of listing windows for a class that already happened.
     */
    async windowsFor(query: RescheduleWindowsDto, now: Date = new Date()): Promise<RescheduleWindowsResult> {
        const group = await this.requireGroup(query.groupId);
        const missed = parseIsoDate(query.date);
        const missedDate = toIsoDate(missed);
        const week = isoWeekOf(missed);
        const locationId = group.room.location?.id ?? null;

        const source = await this.findSource(group.id, missed);
        const inWeek = await this.groupSessionsInWeek(group.id, week);
        const closed = await this.nonTeachingPeriodService.datesIn(parseIsoDate(week.from), addDays(parseIsoDate(week.to), 1), locationId);
        const blocked = this.blockFor(group, missed, source, inWeek);

        const usualStart = hhmm(source?.startTime ?? group.startTime);
        const usualEnd = hhmm(source?.endTime ?? group.endTime);
        const usualRoom = source?.room ?? group.room;

        let windows: RescheduleWindow[] = [];
        if (blocked === null) {
            const [rooms, starts, busy] = await Promise.all([
                this.roomsAt(group),
                this.startsAt(group, locationId),
                this.liveSessionsAt(week, locationId, source?.id ?? null),
            ]);
            windows = buildRescheduleWindows({
                week,
                durationMinutes: minutesBetween(usualStart, usualEnd),
                starts,
                rooms,
                closedDays: closed,
                daysTakenByGroup: new Set(inWeek.filter((session) => session.id !== source?.id).map((session) => toIsoDate(session.date))),
                busy,
                // The slot the class holds — or, when it was never generated, the slot it would
                // have held. Offering that back is not a recovery; it is generation by another name.
                current: { date: missedDate, startTime: usualStart, roomId: usualRoom.id },
                now: schoolLocalStamp(now),
            });
        }

        return {
            week,
            missedDate,
            missedDayClosed: closed.has(missedDate),
            usual: { startTime: usualStart, endTime: usualEnd, roomId: usualRoom.id, roomName: usualRoom.name },
            source:
                source === null
                    ? null
                    : {
                          id: source.id,
                          status: source.status,
                          hasAttendance: source.attendances.length > 0,
                          startTime: hhmm(source.startTime),
                          endTime: hhmm(source.endTime),
                          roomId: source.room.id,
                          roomName: source.room.name,
                          notes: source.notes,
                      },
            blocked,
            windows,
        };
    }

    /**
     * Puts the class in the chosen slot, in the same week, and tells the families where.
     *
     * The refusals, in the order checked: a class that was taught (it has marks — it happened); a
     * day the group has no class on and never would have (nothing to recover); a week that already
     * holds a row for the group somewhere else (start from that one — the week has one row); a
     * target outside the week; an end before the start; a room that does not exist; a target that
     * is the slot the class already holds; a day the calendar closes (per the target room's
     * location, exactly as S5 checks it); a day the group already has a class on; a room busy at
     * that hour. Every check the windows list made is made again here, because that list was a
     * snapshot and the office presses the button a minute later.
     */
    async reschedule(dto: RescheduleClassSessionDto): Promise<ClassSession> {
        const group = await this.requireGroup(dto.groupId);
        const missed = parseIsoDate(dto.date);
        const missedDate = toIsoDate(missed);
        const week = isoWeekOf(missed);

        const source = await this.findSource(group.id, missed);
        const inWeek = await this.groupSessionsInWeek(group.id, week);
        const blocked = this.blockFor(group, missed, source, inWeek);
        if (blocked !== null) {
            const body = { message: blocked.message, error: blocked.code };
            throw blocked.code === 'CLASS_SESSION_NOT_FOUND' ? new NotFoundException(body) : new ConflictException(body);
        }

        const targetDay = parseIsoDate(dto.targetDate);
        const targetDate = toIsoDate(targetDay);
        if (!isInWeek(week, targetDate)) {
            throw new ConflictException({
                message: `Ora se recuperează în aceeași săptămână (${week.from} – ${week.to}) sau deloc: mutată în altă săptămână, ar schimba luna facturată.`,
                error: 'RESCHEDULE_OUT_OF_WEEK',
            });
        }

        const usualStart = hhmm(source?.startTime ?? group.startTime);
        const usualEnd = hhmm(source?.endTime ?? group.endTime);
        const targetStart = dto.startTime ?? usualStart;
        const targetEnd = dto.endTime ?? usualEnd;
        if (targetEnd <= targetStart) {
            throw new BadRequestException({
                message: 'Ora de sfârșit este înaintea celei de început.',
                error: 'SESSION_ENDS_BEFORE_IT_STARTS',
            });
        }

        const usualRoom = source?.room ?? group.room;
        let targetRoom = usualRoom;
        if (dto.roomId !== undefined && dto.roomId !== usualRoom.id) {
            const room = await this.roomRepository.findOne({ where: { id: dto.roomId }, relations: { location: true } });
            if (!room) {
                throw new NotFoundException('Room not found');
            }
            targetRoom = room;
        }

        if (targetDate === missedDate && targetStart === usualStart && targetEnd === usualEnd && targetRoom.id === usualRoom.id) {
            throw new BadRequestException({
                message: 'Ora rămâne exact unde era — alege altă zi, altă oră sau altă sală.',
                error: 'MOVE_CHANGES_NOTHING',
            });
        }

        // The recovery obeys the school calendar exactly as a move does — otherwise the calendar
        // has a side door, and the class lands on the very kind of day it is being moved off.
        const closed = await this.nonTeachingPeriodService.datesIn(targetDay, addDays(targetDay, 1), targetRoom.location?.id ?? null);
        if (closed.has(targetDate)) {
            throw new ConflictException({
                message: `Pe ${targetDate} nu se ține curs — ziua e în calendarul școlar.`,
                error: 'MOVED_ONTO_NON_TEACHING_DAY',
            });
        }

        const sameDay = inWeek.find((session) => session.id !== source?.id && toIsoDate(session.date) === targetDate);
        if (sameDay) {
            throw new ConflictException({
                message: `Grupa are deja o ședință pe ${targetDate}.`,
                error: 'GROUP_ALREADY_HAS_SESSION_THAT_DAY',
            });
        }

        const clash = await this.roomClash(targetRoom.id, targetDate, targetStart, targetEnd, source?.id ?? null);
        if (clash) {
            throw new ConflictException({
                message: `Sala e ocupată atunci de altă ședință (${hhmm(clash.startTime)}–${hhmm(clash.endTime)}).`,
                error: 'ROOM_BUSY_AT_THAT_TIME',
            });
        }

        // Where the class was — or would have been — captured before the row is written: the
        // message tells a parent both halves, and afterwards only the note remembers the first.
        const from: SessionPlacement = {
            date: missedDate,
            startTime: usualStart,
            roomName: usualRoom.name,
            locationName: usualRoom.location?.name ?? '',
        };
        const note = `Recuperată (de pe ${missedDate} ${usualStart}): ${dto.reason}`;

        // One row for the week, whichever state it started in: the existing row is edited — its
        // cancellation note kept, its status put back — and a missing one is written. Never a
        // cancelled row *plus* a new one: the unmarked report would see a lost hour and the month's
        // count would see two classes, one of them unpaid.
        const row = source ?? this.classSessionRepository.create({ group, notes: null, isVacation: false });
        row.notes = row.notes === null || row.notes.trim() === '' ? note : `${row.notes}\n\n${note}`;
        row.date = targetDay;
        row.startTime = `${targetStart}:00`;
        row.endTime = `${targetEnd}:00`;
        row.room = targetRoom;
        row.status = ClassSessionStatus.SCHEDULED;

        // The row and the message stand or fall together, as for every change to a class (S5).
        return this.dataSource.transaction(async (manager) => {
            const saved = await manager.getRepository(ClassSession).save(row);
            await this.notifier.notifyMoved(saved.id, from, dto.reason, manager);
            this.logger.log(
                `Group ${group.id}: class of ${missedDate} recovered on ${targetDate} ${targetStart}–${targetEnd} in room ${targetRoom.id}` +
                    (source === null ? ' (row created)' : ` (row ${source.id}, was ${source.status})`),
            );
            return saved;
        });
    }

    /**
     * What stops the recovery before any target is looked at.
     *
     * A taught class is not recovered — it happened. A day the group never teaches on, with no row,
     * is not a class at all. And a week that already holds another row for the group is a week
     * with its class somewhere: the office starts from that one, or the week ends up with two.
     */
    private blockFor(group: Group, missed: Date, source: ClassSession | null, inWeek: ClassSession[]): RescheduleBlock | null {
        if (source !== null) {
            if (source.attendances.length > 0 || source.status === ClassSessionStatus.HELD) {
                return {
                    code: 'CLASS_SESSION_HAS_ATTENDANCE',
                    message: 'Ora s-a ținut — are prezențe înregistrate, deci nu mai e nimic de recuperat.',
                };
            }
            return null;
        }

        if (isoWeekday(missed) !== group.weekday) {
            return {
                code: 'CLASS_SESSION_NOT_FOUND',
                message: `Grupa nu are oră pe ${toIsoDate(missed)} — ține cursul ${romanianWeekdayName(group.weekday)}.`,
            };
        }
        const elsewhere = inWeek[0];
        if (elsewhere !== undefined) {
            return {
                code: 'GROUP_ALREADY_HAS_SESSION_THAT_WEEK',
                message: `Grupa are deja o ședință în săptămâna aceea, pe ${toIsoDate(elsewhere.date)} — pornește de la ea.`,
            };
        }
        return null;
    }

    private async requireGroup(id: number): Promise<Group> {
        // The room's location comes along because the calendar is asked per location, and the
        // windows are looked for at the group's own address.
        const group = await this.groupRepository.findOne({ where: { id }, relations: { room: { location: true } } });
        if (!group) {
            throw new NotFoundException('Group not found');
        }
        return group;
    }

    /** The group's row on the missed day, whatever its state, with what the checks need. */
    private findSource(groupId: number, missed: Date): Promise<ClassSession | null> {
        return this.classSessionRepository.findOne({
            where: { group: { id: groupId }, date: missed },
            relations: { group: true, room: { location: true }, attendances: true },
        });
    }

    /** Every row the group has in the week, any state — cancelled ones hold their day too, by the unique index. */
    private groupSessionsInWeek(groupId: number, week: Week): Promise<ClassSession[]> {
        return this.classSessionRepository.find({
            where: { group: { id: groupId }, date: Between(parseIsoDate(week.from), parseIsoDate(week.to)) },
            order: { date: 'ASC' },
        });
    }

    /** The active rooms at the group's address, its own first. The own room is offered even if retired — the class is taught there. */
    private async roomsAt(group: Group): Promise<WindowRoom[]> {
        const locationId = group.room.location?.id;
        const rooms =
            locationId === undefined
                ? []
                : await this.roomRepository.find({
                      where: { location: { id: locationId }, isActive: true },
                      relations: { location: true },
                      order: { name: 'ASC' },
                  });
        const others = rooms.filter((room) => room.id !== group.room.id);
        const locationName = group.room.location?.name ?? '';
        return [group.room, ...others].map((room) => ({ id: room.id, name: room.name, locationName: room.location?.name ?? locationName }));
    }

    /** The hours this address teaches at: every active group's start, plus this group's own. */
    private async startsAt(group: Group, locationId: number | null): Promise<string[]> {
        const groups =
            locationId === null
                ? []
                : await this.groupRepository.find({ where: { isActive: true, room: { location: { id: locationId } } }, relations: { room: true } });
        return [...new Set([group.startTime, ...groups.map((other) => other.startTime)].map(hhmm))];
    }

    /** Every live class at the address that week, minus the one being moved — what a window must not overlap. */
    private async liveSessionsAt(week: Week, locationId: number | null, excludeId: number | null): Promise<BusySlot[]> {
        const qb = this.classSessionRepository
            .createQueryBuilder('session')
            .leftJoin('session.room', 'room')
            .leftJoin('room.location', 'location')
            .addSelect(['room.id'])
            .andWhere('session.date >= :from AND session.date <= :to', { from: week.from, to: week.to })
            .andWhere('session.status != :cancelled', { cancelled: ClassSessionStatus.CANCELLED });
        if (locationId !== null) {
            qb.andWhere('location.id = :locationId', { locationId });
        }
        if (excludeId !== null) {
            qb.andWhere('session.id != :excludeId', { excludeId });
        }
        const rows = await qb.getMany();
        return rows.map((session) => ({ date: toIsoDate(session.date), roomId: session.room.id, startTime: session.startTime, endTime: session.endTime }));
    }

    /** A live class already in the room at an overlapping hour — the same query `moveSession` runs. */
    private roomClash(roomId: number, date: string, start: string, end: string, excludeId: number | null): Promise<ClassSession | null> {
        const qb = this.classSessionRepository
            .createQueryBuilder('session')
            .leftJoin('session.room', 'room')
            .andWhere('room.id = :roomId', { roomId })
            .andWhere('session.date = :date', { date })
            .andWhere('session.status != :cancelled', { cancelled: ClassSessionStatus.CANCELLED })
            .andWhere('session.startTime < :end AND :start < session.endTime', { start, end });
        if (excludeId !== null) {
            qb.andWhere('session.id != :id', { id: excludeId });
        }
        return qb.getOne();
    }
}
