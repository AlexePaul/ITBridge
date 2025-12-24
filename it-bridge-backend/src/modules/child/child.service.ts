import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Child } from 'src/entities/child.entity';
import { Profile } from 'src/entities/profile.entity';
import { Role } from 'src/enum/role.enum';
import { Repository } from 'typeorm';
import { CreateChildDto } from './dto/createChild.dto';
import { FilterChildDto } from './dto/filterChild.dto';
import { UpdateChildDto } from './dto/updateChild.dto';

@Injectable()
export class ChildService {
    public constructor(
        @InjectRepository(Child) private readonly childRepository: Repository<Child>,
        @InjectRepository(Profile) private readonly profileRepository: Repository<Profile>,
    ) {}

    async createChild(createChildDto: CreateChildDto, role: Role, userId: number) {
        if (role !== Role.ADMIN) {
            const profile = await this.profileRepository.findOne({
                where: { user: { id: userId } },
            });
            if (!profile || profile.id !== createChildDto.parentId) {
                throw new ForbiddenException('You do not have permission to add a child for this parent');
            }
        }
        const parentProfile = await this.profileRepository.findOne({
            where: { id: createChildDto.parentId },
        });
        if (!parentProfile) {
            throw new NotFoundException('Parent profile not found');
        }
        const child = this.childRepository.create(createChildDto);
        child.parent = parentProfile;
        return this.childRepository.save(child);
    }

    async findChildren(filterChildDto: FilterChildDto, role: Role, sub: number) {
        const query = this.childRepository.createQueryBuilder('child').leftJoin('child.parent', 'parent').leftJoin('parent.user', 'user');

        if (role !== Role.ADMIN) {
            query.andWhere('user.id = :userId', { userId: sub });
        }
        if (filterChildDto.parentId) {
            query.andWhere('parent.id = :parentId', { parentId: filterChildDto.parentId });
        }
        if (filterChildDto.firstName) {
            query.andWhere('lower(child.firstName) LIKE lower(:firstName)', { firstName: `%${filterChildDto.firstName}%` });
        }
        if (filterChildDto.lastName) {
            query.andWhere('lower(child.lastName) LIKE lower(:lastName)', { lastName: `%${filterChildDto.lastName}%` });
        }
        if (filterChildDto.childId) {
            query.andWhere('child.id = :childId', { childId: filterChildDto.childId });
        }
        return query.getMany();
    }

    async updateChild(childId: number, updateChildDto: UpdateChildDto, role: Role, userId: number) {
        const child = await this.childRepository.findOne({
            where: { id: childId },
            relations: ['parent', 'parent.user'],
        });

        if (!child) {
            throw new NotFoundException('Child not found');
        }
        if (role !== Role.ADMIN && child.parent.user.id !== userId) {
            throw new ForbiddenException('You do not have permission to update this child');
        }

        Object.assign(child, updateChildDto);
        return this.childRepository.save(child);
    }

    async deleteChild(childId: number, role: Role, userId: number) {
        const child = await this.childRepository.findOne({
            where: { id: childId },
            relations: ['parent', 'parent.user'],
        });

        if (!child) {
            throw new NotFoundException('Child not found');
        }
        if (role !== Role.ADMIN && child.parent.user.id !== userId) {
            throw new ForbiddenException('You do not have permission to delete this child');
        }

        await this.childRepository.delete(childId);
        return { message: 'Child deleted successfully' };
    }
}
