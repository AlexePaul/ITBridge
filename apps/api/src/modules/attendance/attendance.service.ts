import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Attendance } from 'src/entities/attendance.entity';
import { ClassSession } from 'src/entities/class-session.entity';
import { Child } from 'src/entities/child.entity';
import { AttendanceType } from 'src/enum/attendance-type.enum';
import { ClassSessionStatus } from 'src/enum/class-session-status.enum';
import { markAttendanceDto } from './dto/markAttendance.dto';
import { AbsenceNoticeService } from './absence-notice.service';
import { LeadProgressService } from 'src/modules/lead/lead-progress.service';

@Injectable()
export class AttendanceService {
    constructor(
        @InjectRepository(Attendance) private readonly attendanceRepository: Repository<Attendance>,
        @InjectRepository(ClassSession) private readonly classSessionRepository: Repository<ClassSession>,
        @InjectRepository(Child) private readonly childRepository: Repository<Child>,
        private readonly absenceNoticeService: AbsenceNoticeService,
        private readonly leadProgress: LeadProgressService,
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
        const saved = await this.attendanceRepository.save(attendanceRecords);

        // E20/S3, after the register is written rather than inside it: a lead moving to „probă
        // ținută" is a consequence of what the marks say, and it must not be able to fail a register.
        for (const record of saved) {
            await this.settleLead(record.child.id, classSessionId, record.present);
        }
        return saved;
    }

    /**
     * The whole register of one class, in one payload — E12/S6.
     *
     * One request instead of four (session, group, children, marks), because the screen this serves
     * is a phone in a classroom on whatever signal reaches it. Carries the parent's phone per child
     * so an unannounced absence is one tap from a call (the S7 detail), and the existing mark per
     * child so reopening a half-marked register shows what is already down.
     *
     * Since E12/S3 it also carries whatever the family announced. That is the point of announcing:
     * the teacher learns before the lesson rather than by counting empty chairs, and the row that
     * already has a reason beside it does not need the phone call the S7 button offers.
     */
    async sessionRegister(classSessionId: number) {
        const classSession = await this.classSessionRepository.findOne({
            where: { id: classSessionId },
            relations: { group: { children: { parent: true } } },
        });
        if (!classSession) {
            throw new NotFoundException(`Class session with ID ${classSessionId} does not exist`);
        }

        const marks = await this.attendanceRepository.find({
            where: { classSession: { id: classSessionId } },
            relations: { child: { parent: true } },
        });
        const markByChild = new Map(marks.map((mark) => [mark.child.id, mark]));
        const noticeByChild = await this.absenceNoticeService.forSession(classSessionId);

        const entryOf = (child: Child, type: AttendanceType) => {
            const mark = markByChild.get(child.id);
            const notice = noticeByChild.get(child.id);
            return {
                childId: child.id,
                firstName: child.firstName,
                lastName: child.lastName,
                // For the tel: button. Absent when the profile has no phone — the screen shows
                // nothing rather than a button that dials nowhere.
                parentPhone: child.parent?.phone ?? null,
                type,
                present: mark ? mark.present : null,
                attendanceId: mark ? mark.id : null,
                // What the family said, and whether they said it before the class — E12/S3.
                announcedAbsence: notice ? { reason: notice.reason, inTime: notice.inTime } : null,
            };
        };

        const groupChildIds = new Set(classSession.group.children.map((child) => child.id));
        const entries = classSession.group.children
            .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
            .map((child) => entryOf(child, AttendanceType.REGULAR));
        // A make-up child is not in the group but already has a mark on this class; the register
        // still has to show them, or the screen would silently drop a row the bulk endpoint wrote.
        for (const mark of marks) {
            if (!groupChildIds.has(mark.child.id)) {
                entries.push(entryOf(mark.child, mark.type));
            }
        }

        return {
            session: {
                id: classSession.id,
                date: classSession.date,
                startTime: classSession.startTime,
                endTime: classSession.endTime,
                status: classSession.status,
                groupId: classSession.group.id,
                groupName: classSession.group.name,
            },
            entries,
        };
    }

    /**
     * One tap, one mark — E12/S6.
     *
     * An upsert, unlike the bulk POST above, and idempotent on purpose: the phone screen saves on
     * every tap and retries from a local queue when the network comes back, so the same mark may
     * arrive twice and a changed mind arrives as a second write. Refusing duplicates here (as the
     * bulk endpoint rightly does for a full register) would turn every retry into an error.
     */
    async upsertMark(classSessionId: number, childId: number, present: boolean) {
        const classSession = await this.classSessionRepository.findOne({
            where: { id: classSessionId },
            relations: { group: { children: true } },
        });
        if (!classSession) {
            throw new NotFoundException(`Class session with ID ${classSessionId} does not exist`);
        }
        if (classSession.status === ClassSessionStatus.CANCELLED) {
            throw new BadRequestException(`Class session with ID ${classSessionId} is cancelled; reinstate the session before recording attendance for it`);
        }

        const child = await this.childRepository.findOne({ where: { id: childId } });
        if (!child) {
            throw new NotFoundException(`Child with ID ${childId} was not found in the system`);
        }

        const existing = await this.attendanceRepository.findOne({
            where: { classSession: { id: classSessionId }, child: { id: childId } },
        });
        if (existing) {
            existing.present = present;
            const saved = await this.attendanceRepository.save(existing);
            await this.settleLead(childId, classSessionId, present);
            return saved;
        }

        const record = new Attendance();
        record.child = child;
        record.classSession = classSession;
        record.present = present;
        record.group = classSession.group;
        // Same rule as the bulk endpoint: in the group means regular, anyone else is a make-up.
        record.type = classSession.group.children.some((groupChild) => groupChild.id === childId) ? AttendanceType.REGULAR : AttendanceType.MAKE_UP;
        const saved = await this.attendanceRepository.save(record);
        await this.settleLead(childId, classSessionId, present);
        return saved;
    }

    /**
     * What a mark does to a lead — E20/S3.
     *
     * Called from both write paths for the same reason: the register is the fact, and everything
     * that follows from it has to follow from *both* or the two would disagree. A child marked
     * present at the class their trial was booked into moves their lead to „probă ținută"; a
     * correction back to absent moves it back.
     *
     * It is the only thing left that a mark settles. `settleMakeUp` stood beside it and is gone with
     * the credits — a make-up is now a placement the office records before the class, not a
     * consequence the register works out afterwards.
     */
    private async settleLead(childId: number, classSessionId: number, present: boolean): Promise<void> {
        if (present) {
            await this.leadProgress.markTrialHeld(childId, classSessionId);
            return;
        }
        await this.leadProgress.revertTrialHeld(childId, classSessionId);
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
