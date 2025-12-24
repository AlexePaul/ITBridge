import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Group } from 'src/entities/group.entity';
import { Repository } from 'typeorm/repository/Repository';
import { createGroupDto } from './dto/createGroup.dto';

@Injectable()
export class GroupService {
    constructor(@InjectRepository(Group) private readonly groupRepository: Repository<Group>) {}

    async createGroup(createGroupDto: createGroupDto): Promise<Group> {
        const group = this.groupRepository.create(createGroupDto);
        return await this.groupRepository.save(group);
    }

    async getGroups(): Promise<Group[]> {
        return this.groupRepository.find();
    }

    async getGroupById(id: number): Promise<Group> {
        const group = await this.groupRepository
            .createQueryBuilder('group')
            .where('group.id = :id', { id })
            .leftJoinAndSelect('group.children', 'children')
            .getOne();
        if (!group) {
            throw new NotFoundException('Group not found');
        }
        return group;
    }

    async updateGroup(id: number, updateGroupDto: Partial<createGroupDto>): Promise<Group> {
        const group = await this.getGroupById(id);
        Object.assign(group, updateGroupDto);
        return this.groupRepository.save(group);
    }

    async deleteGroup(id: number): Promise<void> {
        const result = await this.groupRepository.delete(id);
        if (result.affected === 0) {
            throw new NotFoundException('Group not found');
        }
    }
}
