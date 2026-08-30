import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Attendance } from 'src/entities/attendance.entity';
import { ClassSession } from 'src/entities/class-session.entity';
import { Child } from 'src/entities/child.entity';
import { AttendanceType } from 'src/enum/attendance-type.enum';
import { ClassSessionStatus } from 'src/enum/class-session-status.enum';
import { markAttendanceDto } from './dto/markAttendance.dto';

@Injectable()
export class AttendanceService {
    constructor(
        @InjectRepository(Attendance) private readonly attendanceRepository: Repository<Attendance>,
        @InjectRepository(ClassSession) private readonly classSessionRepository: Repository<ClassSession>,
        @InjectRepository(Child) private readonly childRepository: Repository<Child>,
    ) {}

    /**
     * Marks a whole class at once.
     *
     * The class is named by id, not described by date and hour. The group is no longer a parameter
     * either: it is `classSession.group`, so the caller can no longer post marks for one group
     * against another group's hour — a combination the old signature accepted without complaint.
     */
    async createAttendance(classSessionId: number, markAttendanceDto: markAttendanceDto) {
        const classSession = await this.classSessionRepository.findOne({
            where: { id: classSessionId },
            relations: { group: { children: true } },
        });
        if (!classSession) {
            throw new NotFoundException(`Class session with ID ${classSessionId} does not exist`);
        }

        // A cancelled class did not happen, so nobody was present at it and nobody was absent from
        // it either. Refusing here keeps the register from contradicting the timetable; if the
        // class was taught after all, the session is the thing that was wrong and it gets
        // reinstated first.
        if (classSession.status === ClassSessionStatus.CANCELLED) {
            throw new BadRequestException(`Class session with ID ${classSessionId} is cancelled; reinstate the session before recording attendance for it`);
        }

        const group = classSession.group;
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

        // One query for the whole class, mirroring `@Unique(['child', 'classSession'])`. It used to
        // be a list of `{ child, date, startTime }` clauses, one per child, because that was the
        // shape of the old key.
        const existingRecords = await this.attendanceRepository.find({
            where: { classSession: { id: classSessionId }, child: { id: In(reqChildrenIds) } },
            relations: ['child'],
        });

        if (existingRecords.length > 0) {
            const existingChildIds = existingRecords.map((r) => r.child.id);
            throw new ConflictException(`Attendance records already exist for children ${existingChildIds.join(', ')} in class session ${classSessionId}`);
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
            record.classSession = classSession;
            record.present = attendance.present;
            // Same value as `classSession.group`, written because the column is still there and
            // still NOT NULL. See the comment on `Attendance.group`: it goes once the read path
            // stops selecting on it.
            record.group = group;
            record.type = groupChildrenIds.includes(attendance.childId) ? AttendanceType.REGULAR : AttendanceType.MAKE_UP;
            return record;
        });

        // The session's own status is deliberately left alone. Marking the register is evidence the
        // class was held, and flipping it to HELD here is tempting — but the daily reminder job
        // (E12) looks for yesterday's `scheduled` sessions *with no attendance rows*, so the two
        // signals are independent by design, and status transitions belong to whoever owns the
        // session, not to the register.
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

        if (userRole !== 'ADMIN' && child.parent.user?.id !== userId) {
            throw new ForbiddenException(`You don't have permission to view attendance for this child`);
        }

        return this.attendanceRepository.find({
            where: { child: { id: childId } },
            // The session comes along whole, because it is where the date, the hours and the room
            // now live — a record without it says only "present", with no answer to "at what?".
            // `group` and its room stay loaded as well: they are the same values as
            // `classSession.group`, and the duplication is the price of not breaking the admin
            // list's location filter in this change. It disappears with `Attendance.group`.
            relations: {
                classSession: { group: { room: { location: true } }, room: { location: true } },
                group: { room: { location: true } },
            },
            // Chronological, which the previous shape could not offer: the client sorted on the
            // record's own `date`, and that column is gone.
            order: { classSession: { date: 'ASC', startTime: 'ASC' } },
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
