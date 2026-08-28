import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Group } from 'src/entities/group.entity';
import { Room } from 'src/entities/room.entity';
import { Not, Repository } from 'typeorm';
import { createGroupDto } from './dto/createGroup.dto';
import { updateGroupDto } from './dto/updateGroup.dto';
import { applyDefined } from 'src/common/apply-defined';

@Injectable()
export class GroupService {
    constructor(
        @InjectRepository(Group) private readonly groupRepository: Repository<Group>,
        @InjectRepository(Room) private readonly roomRepository: Repository<Room>,
    ) {}

    async createGroup(createGroupDto: createGroupDto): Promise<Group> {
        const room = await this.findRoomOrFail(createGroupDto.roomId);
        this.assertRoomIsUsable(room);
        this.assertFitsInRoom(createGroupDto.capacity, room);
        await this.assertSlotIsFree(room.id, createGroupDto.weekday, createGroupDto.startTime);

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
        const group = await this.getGroupById(id);

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
        const capacity = updateGroupDto.capacity ?? group.capacity;

        this.assertFitsInRoom(capacity, room);
        if (room.id !== group.room.id || weekday !== group.weekday || startTime !== normalizeTime(group.startTime)) {
            await this.assertSlotIsFree(room.id, weekday, startTime, id);
        }
        group.room = room;

        const { roomId: _roomId, ...fields } = updateGroupDto;
        applyDefined(group, fields);
        return this.groupRepository.save(group);
    }

    async deleteGroup(id: number): Promise<void> {
        const result = await this.groupRepository.delete(id);
        if (result.affected === 0) {
            throw new NotFoundException('Group not found');
        }
    }

    private async findRoomOrFail(id: number): Promise<Room> {
        const room = await this.roomRepository.findOne({ where: { id }, relations: { location: true } });
        if (!room) {
            throw new NotFoundException('Room not found');
        }
        return room;
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
    private async assertSlotIsFree(roomId: number, weekday: number, startTime: string, exceptId?: number): Promise<void> {
        const clash = await this.groupRepository.findOne({
            where: {
                room: { id: roomId },
                weekday,
                // Postgres stores `time` as HH:MM:SS while the DTO accepts HH:MM, so the two forms
                // have to be compared in the same one or a real collision looks free.
                startTime: normalizeTime(startTime),
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
