import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Group } from 'src/entities/group.entity';
import { Room } from 'src/entities/room.entity';
import { DataSource, EntityManager, FindOperator, In, LessThan, MoreThan, Not, Raw, Repository } from 'typeorm';
import { EnrollmentService } from 'src/modules/enrollment/enrollment.service';
import { ClassSessionService } from 'src/modules/class-session/class-session.service';
import { createGroupDto } from './dto/createGroup.dto';
import { updateGroupDto } from './dto/updateGroup.dto';
import { applyDefined } from 'src/common/apply-defined';
import { ClassSession } from 'src/entities/class-session.entity';
import { ClassSessionStatus } from 'src/enum/class-session-status.enum';
import { schoolDay } from 'src/common/school-clock';
import { romanianDayAndDate } from 'src/modules/mail/romanian-date';
import { Enrollment } from 'src/entities/enrollment.entity';
import { Attendance } from 'src/entities/attendance.entity';
import { WaitlistEntry } from 'src/entities/waitlist-entry.entity';
import { Announcement } from 'src/entities/announcement.entity';
import { WaitlistStatus } from 'src/enum/waitlist-status.enum';

@Injectable()
export class GroupService {
    constructor(
        @InjectRepository(Group) private readonly groupRepository: Repository<Group>,
        @InjectRepository(Room) private readonly roomRepository: Repository<Room>,
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly enrollments: EnrollmentService,
        private readonly classSessions: ClassSessionService,
    ) {}

    async createGroup(createGroupDto: createGroupDto): Promise<Group> {
        const room = await this.findRoomOrFail(createGroupDto.roomId);
        this.assertRoomIsUsable(room);
        this.assertFitsInRoom(createGroupDto.capacity, room);
        assertEndsAfterStart(createGroupDto.startTime, createGroupDto.endTime);
        await this.assertSlotIsFree(room.id, createGroupDto.weekday, createGroupDto.startTime, createGroupDto.endTime);

        const { roomId: _roomId, ...fields } = createGroupDto;
        const group = this.groupRepository.create(fields);
        group.room = room;
        group.isActive = true;
        return await this.groupRepository.save(group);
    }

    /**
     * The room and its location come along on every read. They are what tells an admin *where* a
     * group meets, and the frontend's location filter has nothing to filter on without them.
     */
    async getGroups(): Promise<Group[]> {
        return this.groupRepository.find({
            relations: { room: { location: true } },
            order: { weekday: 'ASC', startTime: 'ASC' },
        });
    }

    async getGroupById(id: number): Promise<Group> {
        const group = await this.groupRepository
            .createQueryBuilder('group')
            .where('group.id = :id', { id })
            .leftJoinAndSelect('group.children', 'children')
            .leftJoinAndSelect('group.room', 'room')
            .leftJoinAndSelect('room.location', 'location')
            .getOne();
        if (!group) {
            throw new NotFoundException('Group not found');
        }
        return group;
    }

    async updateGroup(id: number, updateGroupDto: updateGroupDto): Promise<Group> {
        // **Without `children`.** `save` on a group loaded with them treats the list as the truth
        // and rewrites `children.group_id` to match it — so an enrolment committed between this
        // read and the write below came out with no group while it was in force, and a transfer in
        // the same window was pointed back at the old one. `Child.group` has one writer,
        // `EnrollmentService`, and an edit of a group's name is not it.
        const group = await this.groupRepository.findOne({ where: { id }, relations: { room: { location: true } } });
        if (!group) {
            throw new NotFoundException('Group not found');
        }

        // Whatever the request leaves out keeps its current value — including in the collision
        // check below, which has to run against the slot the group is about to occupy rather than
        // the one it occupies now.
        const room = updateGroupDto.roomId === undefined ? group.room : await this.findRoomOrFail(updateGroupDto.roomId);
        // Only when the group is actually moving. A room that is closed *after* a group was put in
        // it must not make that group uneditable — renaming it, or moving it out, has to keep
        // working, and that is exactly what an admin does next.
        if (updateGroupDto.roomId !== undefined && room.id !== group.room.id) {
            this.assertRoomIsUsable(room);
        }
        const weekday = updateGroupDto.weekday ?? group.weekday;
        // Normalised on both sides: the column hands back `09:00:00` and the DTO accepts `09:00`,
        // so comparing them raw reports a move every time the caller resends the current time.
        const startTime = normalizeTime(updateGroupDto.startTime ?? group.startTime);
        const endTime = normalizeTime(updateGroupDto.endTime ?? group.endTime);
        const capacity = updateGroupDto.capacity ?? group.capacity;

        this.assertFitsInRoom(capacity, room);
        assertEndsAfterStart(startTime, endTime);
        if (
            room.id !== group.room.id ||
            weekday !== group.weekday ||
            startTime !== normalizeTime(group.startTime) ||
            endTime !== normalizeTime(group.endTime)
        ) {
            await this.assertSlotIsFree(room.id, weekday, startTime, endTime, id);
        }
        // Where the group met until now — its coming classes are found by it, and told from it.
        const before = { weekday: group.weekday, startTime: group.startTime, endTime: group.endTime, room: group.room };
        group.room = room;

        const { roomId: _roomId, ...fields } = updateGroupDto;
        applyDefined(group, fields);
        const slotMoved =
            group.weekday !== before.weekday ||
            normalizeTime(group.startTime) !== normalizeTime(before.startTime) ||
            normalizeTime(group.endTime) !== normalizeTime(before.endTime) ||
            group.room.id !== before.room.id;
        await this.dataSource.transaction(async (manager) => {
            // A class another group was moved into for one week holds the room at that hour too:
            // following the group there would put two classes in one room (QA of 26 September 2026).
            if (slotMoved) {
                await this.assertNoMovedClassInTheWay(manager, room.id, weekday, startTime, endTime, id);
            }
            await manager.save(Group, group);
            // The coming classes follow the group to its new day, hour or room, and the families
            // hear once — see `followGroup`. Without it the edit left the old day's classes standing
            // and the next generation wrote the new day's beside them.
            if (slotMoved) await this.classSessions.followGroup(group, before, manager);
            // A capacity raised, or a group made active again, is seats a waiting family can have.
            // Asked in the same transaction, the way every release is; a no-op when nothing is free
            // or nobody waits.
            await this.enrollments.offerFreeSeatsIn([id], manager);
        });
        return this.getGroupById(id);
    }

    /**
     * A group is deleted only while nothing hangs off it (QA of 26 September 2026). Its enrolments
     * (`RESTRICT`) and its register (`attendances.group`, no action) stopped the delete in the
     * database, which reached the client as the filter's generic "still referenced"; its waiting
     * list (`CASCADE`) stopped nothing, and the families waiting for a seat — one of them perhaps
     * holding an offer — went with the group without a word. A group that has run is deactivated
     * instead: it keeps its history and takes no new children. The foreign keys stay the backstop
     * for a row written between the counts and the delete.
     */
    async deleteGroup(id: number): Promise<void> {
        await this.dataSource.transaction(async (manager) => {
            if ((await manager.getRepository(Enrollment).count({ where: { group: { id } } })) > 0) {
                throw new ConflictException({ message: 'Children were enrolled in this group; deactivate it instead', error: 'GROUP_HAS_ENROLMENTS' });
            }
            if ((await manager.getRepository(Attendance).count({ where: { group: { id } } })) > 0) {
                throw new ConflictException({ message: 'The group has a register; deactivate it instead', error: 'GROUP_HAS_ATTENDANCE' });
            }
            const waiting = await manager
                .getRepository(WaitlistEntry)
                .count({ where: { group: { id }, status: In([WaitlistStatus.WAITING, WaitlistStatus.OFFERED]) } });
            if (waiting > 0) {
                throw new ConflictException({
                    message: 'Families are waiting for a seat in this group; take them off the list first',
                    error: 'GROUP_HAS_WAITLIST',
                });
            }
            // An announcement keeps the group it went to (`RESTRICT`): who was told stays readable.
            if ((await manager.getRepository(Announcement).count({ where: { group: { id } } })) > 0) {
                throw new ConflictException({
                    message: 'Announcements were sent to this group; deactivate it instead',
                    error: 'GROUP_HAS_ANNOUNCEMENTS',
                });
            }
            const result = await manager.delete(Group, id);
            if (result.affected === 0) {
                throw new NotFoundException('Group not found');
            }
        });
    }

    private async findRoomOrFail(id: number): Promise<Room> {
        const room = await this.roomRepository.findOne({ where: { id }, relations: { location: true } });
        if (!room) {
            throw new NotFoundException('Room not found');
        }
        return room;
    }

    /**
     * A class of another group moved into this room at this hour, on a day still ahead. The group's
     * coming classes would follow it there (`followGroup`), and the room would hold two.
     */
    private async assertNoMovedClassInTheWay(
        manager: EntityManager,
        roomId: number,
        weekday: number,
        startTime: string,
        endTime: string,
        groupId: number,
    ): Promise<void> {
        const clash = await manager.getRepository(ClassSession).findOne({
            where: {
                room: { id: roomId },
                group: { id: Not(groupId) },
                status: Not(ClassSessionStatus.CANCELLED),
                date: onWeekdayFrom(weekday, schoolDay(new Date())),
                startTime: LessThan(normalizeTime(endTime)),
                endTime: MoreThan(normalizeTime(startTime)),
            },
            relations: { group: true },
            order: { date: 'ASC' },
        });
        if (clash) {
            throw new ConflictException({
                // Romanian like the timetable's own ROOM_BUSY_AT_THAT_TIME: the sentence carries the day
                // and the group, so the screen shows it as it is instead of a sentence of its own.
                message:
                    `Sala e ocupată ${romanianDayAndDate(clash.date)}, la ${clash.startTime.slice(0, 5)}, de o oră a grupei ` +
                    `„${clash.group.name}", mutată acolo. Mut-o întâi pe aceea sau alege altă oră.`,
                error: 'ROOM_BUSY_AT_THAT_TIME',
            });
        }
    }

    /**
     * A closed room, or one at a closed location, takes no new groups.
     *
     * Without this, `isActive` would be decoration: the admin screens would stop offering the room
     * while the API went on accepting it, and the two would disagree about what the flag means.
     */
    private assertRoomIsUsable(room: Room): void {
        if (!room.isActive || !room.location.isActive) {
            const what = room.isActive ? `location ${room.location.name} is` : `room ${room.name} is`;
            throw new ConflictException({ message: `Cannot schedule a group here: the ${what} inactive`, error: 'ROOM_INACTIVE' });
        }
    }

    /** A group cannot admit more children than the room holds. */
    private assertFitsInRoom(capacity: number, room: Room): void {
        if (capacity > room.capacity) {
            throw new ConflictException({
                message: `Group capacity ${capacity} exceeds the capacity of room ${room.name} (${room.capacity})`,
                error: 'GROUP_OVER_ROOM_CAPACITY',
            });
        }
    }

    /**
     * The database enforces this too, through `UQ_groups_room_weekday_start` — but a unique
     * violation reaches the client as "A record with these values already exists", which does not
     * say what collided. Checking first is what makes the answer actionable.
     *
     * Note that this is per room, not per school: two locations teaching at the same hour is the
     * normal case, and forbidding it was the bug E08/S2 exists to fix.
     */
    private async assertSlotIsFree(roomId: number, weekday: number, startTime: string, endTime: string, exceptId?: number): Promise<void> {
        // Overlapping hours, not only the same start: 16:30–18:00 beside 16:00–17:30 in one room was
        // accepted, because the unique index — and this check — only knew equal starts (QA of 26
        // September 2026). Postgres stores `time` as HH:MM:SS while the DTO accepts HH:MM, so both
        // sides are compared in the stored form.
        const clash = await this.groupRepository.findOne({
            where: {
                room: { id: roomId },
                weekday,
                startTime: LessThan(normalizeTime(endTime)),
                endTime: MoreThan(normalizeTime(startTime)),
                ...(exceptId === undefined ? {} : { id: Not(exceptId) }),
            },
            relations: { room: true },
        });
        if (clash) {
            throw new ConflictException({
                message: `Room is already taken at this time by the group "${clash.name}"`,
                error: 'GROUP_SLOT_TAKEN',
            });
        }
    }
}

/** `09:00` and `09:00:00` are the same instant; the column always holds the second form. */
function normalizeTime(time: string): string {
    return time.length === 5 ? `${time}:00` : time;
}

/** A group that ends at or before it starts is a typing slip, not a slot — 12:00–11:00 was accepted. */
function assertEndsAfterStart(startTime: string, endTime: string): void {
    if (normalizeTime(endTime) <= normalizeTime(startTime)) {
        throw new BadRequestException({ message: 'The group ends before it starts.', error: 'GROUP_ENDS_BEFORE_IT_STARTS' });
    }
}

/** A day from `from` on (a `YYYY-MM-DD` school day) that falls on the ISO `weekday`. */
function onWeekdayFrom(weekday: number, from: string): FindOperator<Date> {
    const operator: unknown = Raw((alias) => `${alias} >= :from AND EXTRACT(ISODOW FROM ${alias}) = :weekday`, { from, weekday });
    return operator as FindOperator<Date>;
}
