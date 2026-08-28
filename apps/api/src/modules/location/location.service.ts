import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Location } from 'src/entities/location.entity';
import { Room } from 'src/entities/room.entity';
import { CreateLocationDto } from './dto/createLocation.dto';
import { UpdateLocationDto } from './dto/updateLocation.dto';
import { applyDefined } from 'src/common/apply-defined';

@Injectable()
export class LocationService {
    constructor(
        @InjectRepository(Location) private readonly locationRepository: Repository<Location>,
        @InjectRepository(Room) private readonly roomRepository: Repository<Room>,
    ) {}

    async createLocation(dto: CreateLocationDto): Promise<Location> {
        await this.assertSlugIsFree(dto.slug);
        return this.locationRepository.save(this.locationRepository.create(dto));
    }

    /** Ordered by name, because this list is a picker before it is a report. */
    async findLocations(): Promise<Location[]> {
        return this.locationRepository.find({ order: { name: 'ASC' } });
    }

    async findLocationById(id: number): Promise<Location> {
        const location = await this.locationRepository.findOne({ where: { id }, relations: { rooms: true } });
        if (!location) {
            throw new NotFoundException('Location not found');
        }
        return location;
    }

    async updateLocation(id: number, dto: UpdateLocationDto): Promise<Location> {
        const location = await this.findLocationById(id);
        if (dto.slug !== undefined && dto.slug !== location.slug) {
            await this.assertSlugIsFree(dto.slug, id);
        }
        applyDefined(location, dto);
        return this.locationRepository.save(location);
    }

    async deleteLocation(id: number): Promise<void> {
        // The foreign key is ON DELETE RESTRICT, so the database would refuse this anyway — but as
        // a driver error the client sees a generic 500. Asking first turns it into an answer.
        const rooms = await this.roomRepository.count({ where: { location: { id } } });
        if (rooms > 0) {
            throw new ConflictException({ message: 'Location still has rooms; delete or move them first', error: 'LOCATION_HAS_ROOMS' });
        }
        const result = await this.locationRepository.delete(id);
        if (result.affected === 0) {
            throw new NotFoundException('Location not found');
        }
    }

    /**
     * The slug is what the public location pages and the frontend's location selector match on, so
     * a duplicate is a broken link rather than a cosmetic problem. `Not(id)` excludes the row being
     * updated — without it, renaming nothing would collide with itself.
     */
    private async assertSlugIsFree(slug: string, exceptId?: number): Promise<void> {
        const existing = await this.locationRepository.findOne({
            where: exceptId === undefined ? { slug } : { slug, id: Not(exceptId) },
        });
        if (existing) {
            throw new ConflictException({ message: 'Slug is already in use', error: 'LOCATION_SLUG_TAKEN' });
        }
    }
}
