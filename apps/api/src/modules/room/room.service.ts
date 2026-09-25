import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Not, Repository } from 'typeorm';
import { Group } from 'src/entities/group.entity';
import { Location } from 'src/entities/location.entity';
import { Room } from 'src/entities/room.entity';
import { CreateRoomDto } from './dto/createRoom.dto';
import { FilterRoomDto } from './dto/filterRoom.dto';
import { UpdateRoomDto } from './dto/updateRoom.dto';
import { applyDefined } from 'src/common/apply-defined';

@Injectable()
export class RoomService {
    constructor(
        @InjectRepository(Room) private readonly roomRepository: Repository<Room>,
        @InjectRepository(Location) private readonly locationRepository: Repository<Location>,
        @InjectRepository(Group) private readonly groupRepository: Repository<Group>,
    ) {}

    async createRoom(dto: CreateRoomDto): Promise<Room> {
        const location = await this.findLocationOrFail(dto.locationId);
        await this.assertNameIsFree(dto.name, dto.locationId);

        const { locationId: _locationId, ...fields } = dto;
        const room = this.roomRepository.create(fields);
        room.location = location;
        return this.roomRepository.save(room);
    }

    /** The location always comes along: a room name means nothing without the address it is at. */
    async findRooms(filters: FilterRoomDto): Promise<Room[]> {
        return this.roomRepository.find({
            where: filters.locationId === undefined ? {} : { location: { id: filters.locationId } },
            relations: { location: true },
            order: { location: { name: 'ASC' }, name: 'ASC' },
        });
    }

    async findRoomById(id: number): Promise<Room> {
        const room = await this.roomRepository.findOne({ where: { id }, relations: { location: true } });
        if (!room) {
            throw new NotFoundException('Room not found');
        }
        return room;
    }

    async updateRoom(id: number, dto: UpdateRoomDto): Promise<Room> {
        const room = await this.findRoomById(id);

        // A room can be moved between locations, and the name only has to be unique within one —
        // so the check runs against wherever it is about to live, not where it lives now.
        const targetLocationId = dto.locationId ?? room.location.id;
        if (dto.locationId !== undefined && dto.locationId !== room.location.id) {
            room.location = await this.findLocationOrFail(dto.locationId);
        }
        if (dto.name !== undefined || dto.locationId !== undefined) {
            await this.assertNameIsFree(dto.name ?? room.name, targetLocationId, id);
        }

        // A room made smaller than a group that meets in it — the review of 25 September 2026. The
        // group check (`assertFitsInRoom`) ran only when a group was created or moved, so lowering the
        // room afterwards left a group of ten in a room of six, and every count went on offering ten.
        if (dto.capacity !== undefined && dto.capacity < room.capacity) {
            const tooBig = await this.groupRepository.find({ where: { room: { id }, capacity: MoreThan(dto.capacity) }, order: { capacity: 'DESC' } });
            if (tooBig.length > 0) {
                throw new ConflictException({
                    message: `Grupa „${tooBig[0].name}" are ${tooBig[0].capacity} locuri în sala asta. Micșorează grupa întâi, sau mut-o în altă sală.`,
                    error: 'ROOM_SMALLER_THAN_GROUP',
                });
            }
        }

        const { locationId: _locationId, ...fields } = dto;
        applyDefined(room, fields);
        return this.roomRepository.save(room);
    }

    async deleteRoom(id: number): Promise<void> {
        // Same reasoning as deleting a location: the FK is RESTRICT, and a driver error would
        // reach the client as an unexplained 500.
        const groups = await this.groupRepository.count({ where: { room: { id } } });
        if (groups > 0) {
            throw new ConflictException({ message: 'Room still hosts groups; move them to another room first', error: 'ROOM_HAS_GROUPS' });
        }
        const result = await this.roomRepository.delete(id);
        if (result.affected === 0) {
            throw new NotFoundException('Room not found');
        }
    }

    private async findLocationOrFail(id: number): Promise<Location> {
        const location = await this.locationRepository.findOne({ where: { id } });
        if (!location) {
            throw new NotFoundException('Location not found');
        }
        return location;
    }

    private async assertNameIsFree(name: string, locationId: number, exceptId?: number): Promise<void> {
        const existing = await this.roomRepository.findOne({
            where: { name, location: { id: locationId }, ...(exceptId === undefined ? {} : { id: Not(exceptId) }) },
        });
        if (existing) {
            throw new ConflictException({ message: 'A room with this name already exists at this location', error: 'ROOM_NAME_TAKEN' });
        }
    }
}
