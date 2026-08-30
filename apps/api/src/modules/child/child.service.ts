import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
import { EnrollmentService } from 'src/modules/enrollment/enrollment.service';
import { EnrollmentStatus } from 'src/enum/enrollment-status.enum';

@Injectable()
export class ChildService {
    public constructor(
        @InjectRepository(Child) private readonly childRepository: Repository<Child>,
        @InjectRepository(Profile) private readonly profileRepository: Repository<Profile>,
        @InjectRepository(Group) private readonly groupRepository: Repository<Group>,
        private readonly enrollmentService: EnrollmentService,
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
     * Puts a child in a group — by opening an enrolment, not by writing a foreign key.
     *
     * Since E11/S1 this is a thin front door onto `EnrollmentService`, kept because the route
     * `POST /children/:childId/groups/:groupId` is what the admin screens already call. Everything
     * that used to live here — the account gate from S2, and now the one-group rule and the
     * capacity rule — lives there, in the one place that writes `Child.group`.
     *
     * The alternative was to keep setting the column here and *also* record an enrolment, which is
     * two writers for one fact and exactly the drift the derived column is supposed to avoid.
     */
    async assignChildToGroup(childId: number, groupId: number, actingUserId: number) {
        return this.enrollmentService.enrol({ childId, groupId }, actingUserId);
    }

    /**
     * Takes a child out of a group, closing the enrolment as withdrawn.
     *
     * The seat is freed and offered to whoever is waiting, which is `EnrollmentService.close`'s
     * job. Removing the child by blanking `Child.group` would have left the enrolment open, the
     * history wrong, and the seat held by nobody.
     */
    async removeChildFromGroup(childId: number, groupId: number) {
        const inForce = await this.enrollmentService.inForceFor(childId);
        if (!inForce || inForce.group.id !== groupId) {
            throw new NotFoundException('Child not found in the specified group');
        }

        await this.enrollmentService.close(inForce.id, { status: EnrollmentStatus.WITHDRAWN });
        return { message: 'Child removed from the group' };
    }
}
