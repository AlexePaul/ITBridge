import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm/dist/common/typeorm.decorators';
import { Attendance } from 'src/entities/attendance.entity';
import { Repository } from 'typeorm/repository/Repository';
import { Group } from 'src/entities/group.entity';
import { markAttendanceDto } from './dto/markAttendance.dto';
import { Child } from 'src/entities/child.entity';

@Injectable()
export class AttendanceService {
    constructor(
        @InjectRepository(Attendance) private readonly attendanceRepository: Repository<Attendance>,
        @InjectRepository(Group) private readonly groupRepository: Repository<Group>,
        @InjectRepository(Child) private readonly childRepository: Repository<Child>,
    ) {}

    async createAttendance(groupId: number, markAttendanceDto: markAttendanceDto) {
        // Validate group exists
        const group = await this.groupRepository.findOne({ where: { id: groupId }, relations: ['children'] });
        if (!group) {
            throw new NotFoundException(`Group with ID ${groupId} does not exist`);
        }

        const groupChildrenIds = group.children.map((child) => child.id);
        const reqChildrenIds = markAttendanceDto.childrenAttendance.map((att) => att.childId);

        for (const childId of groupChildrenIds) {
            if (!reqChildrenIds.includes(childId)) {
                throw new BadRequestException(`Child with id ${childId} is missing in attendance marking request`);
            }
        }

        const validChildren = await this.childRepository.findByIds(reqChildrenIds);
        const validChildIds = validChildren.map((child) => child.id);

        const invalidIds = reqChildrenIds.filter((id) => !validChildIds.includes(id));
        if (invalidIds.length > 0) {
            throw new NotFoundException(`Children with IDs ${invalidIds.join(', ')} do not exist`);
        }

        // Batch check for existing records with same child + date + startTime combination
        const existingRecords = await this.attendanceRepository.find({
            where: reqChildrenIds.map((childId) => ({
                child: { id: childId },
                date: new Date(markAttendanceDto.date),
                startTime: markAttendanceDto.startTime,
            })),
            relations: ['child'],
        });

        if (existingRecords.length > 0) {
            const existingChildIds = existingRecords.map((r) => r.child.id);
            throw new ConflictException(
                `Attendance records already exist for children ${existingChildIds.join(', ')} on ${markAttendanceDto.date} at ${markAttendanceDto.startTime}`,
            );
        }

        const childMap = new Map(validChildren.map((child) => [child.id, child]));

        // Verify all requested children are in the map
        for (const attendance of markAttendanceDto.childrenAttendance) {
            if (!childMap.has(attendance.childId)) {
                throw new NotFoundException(`Child with ID ${attendance.childId} was not found in the system`);
            }
        }

        const attendanceRecords = markAttendanceDto.childrenAttendance.map((attendance) => {
            const record = new Attendance();
            record.child = childMap.get(attendance.childId)!;
            record.date = new Date(markAttendanceDto.date);
            record.startTime = markAttendanceDto.startTime;
            record.present = attendance.present;
            record.group = group;
            record.type = groupChildrenIds.includes(attendance.childId) ? 'regular' : 'make-up';
            return record;
        });

        return this.attendanceRepository.save(attendanceRecords);
    }
    async getAttendanceByChild(childId: number, userRole: string, userId: number) {
        const child = await this.childRepository.findOne({
            where: { id: childId },
            relations: ['parent', 'parent.user'],
        });

        if (!child) {
            throw new NotFoundException(`Child with ID ${childId} does not exist`);
        }

        if (userRole !== 'ADMIN' && child.parent.user.id !== userId) {
            throw new ForbiddenException(`You don't have permission to view attendance for this child`);
        }

        return this.attendanceRepository.find({
            where: { child: { id: childId } },
            relations: ['group'],
        });
    }
    async updateAttendanceStatus(attendanceId: number, present: boolean) {
        const attendanceRecord = await this.attendanceRepository.findOne({ where: { id: attendanceId } });

        if (!attendanceRecord) {
            throw new NotFoundException(`Attendance record with ID ${attendanceId} does not exist`);
        }
        attendanceRecord.present = present;
        return this.attendanceRepository.save(attendanceRecord);
    }
}
