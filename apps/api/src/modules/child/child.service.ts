import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Child } from 'src/entities/child.entity';
import { Profile } from 'src/entities/profile.entity';
import { Role } from 'src/enum/role.enum';
import { Repository } from 'typeorm';
import { CreateChildDto } from './dto/createChild.dto';
import { FilterChildDto } from './dto/filterChild.dto';
import { UpdateChildDto } from './dto/updateChild.dto';
import { Group } from 'src/entities/group.entity';
import { applyDefined } from 'src/common/apply-defined';
import { isAccountActive } from 'src/entities/user.entity';

@Injectable()
export class ChildService {
    public constructor(
        @InjectRepository(Child) private readonly childRepository: Repository<Child>,
        @InjectRepository(Profile) private readonly profileRepository: Repository<Profile>,
        @InjectRepository(Group) private readonly groupRepository: Repository<Group>,
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
        const query = this.childRepository
            .createQueryBuilder('child')
            .leftJoinAndSelect('child.parent', 'parent')
            .leftJoin('parent.user', 'user')
            // The room and its location come along, because `Group` in the shared contract carries
            // them — a group returned without a room is a wire shape the frontend does not expect,
            // and the admin's location filter has nothing to read.
            .leftJoinAndSelect('child.group', 'group')
            .leftJoinAndSelect('group.room', 'room')
            .leftJoinAndSelect('room.location', 'location');

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
        if (role !== Role.ADMIN && child.parent.user?.id !== userId) {
            throw new ForbiddenException('You do not have permission to update this child');
        }

        applyDefined(child, updateChildDto);
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
        if (role !== Role.ADMIN && child.parent.user?.id !== userId) {
            throw new ForbiddenException('You do not have permission to delete this child');
        }

        await this.childRepository.delete(childId);
        return { message: 'Child deleted successfully' };
    }

    /**
     * Puts a child in a group. Admin-only, and it stays that way — D2: the parent does not choose
     * the group, the school does.
     *
     * The account gate from E11/S2 is enforced here, which is the one place it changes an outcome:
     * a family whose account has not been confirmed and approved cannot have a child enrolled. The
     * epic's acceptance says exactly this, and it is the reason the two gates are more than a
     * status badge on a screen.
     */
    async assignChildToGroup(childId: number, groupId: number) {
        const child = await this.childRepository.findOne({
            where: { id: childId },
            relations: { parent: { user: true } },
        });
        if (!child) {
            throw new NotFoundException('Child not found');
        }

        // `parent.user` is nullable by design: an admin can enter a family from a phone call, with
        // no account at all. There is nothing to confirm and nobody to approve in that case, so the
        // gate does not apply — applying it would block the flow the platform deliberately keeps.
        const parentAccount = child.parent?.user;
        if (parentAccount && !isAccountActive(parentAccount)) {
            throw new ConflictException({
                message: 'Contul părintelui nu este activ. Trebuie confirmat prin email și aprobat înainte de înscriere.',
                error: 'PARENT_ACCOUNT_NOT_ACTIVE',
            });
        }
        const group = await this.groupRepository.findOne({ where: { id: groupId } });
        if (!group) {
            throw new NotFoundException('Group not found');
        }

        child.group = { id: groupId } as Group;
        return this.childRepository.save(child);
    }

    async removeChildFromGroup(childId: number, groupId: number) {
        const child = await this.childRepository.findOne({ where: { id: childId, group: { id: groupId } } });
        if (!child) {
            throw new NotFoundException('Child not found in the specified group');
        }

        child.group = null;
        return this.childRepository.save(child);
    }
}
