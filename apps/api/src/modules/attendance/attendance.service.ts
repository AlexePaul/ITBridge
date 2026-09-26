import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Attendance } from 'src/entities/attendance.entity';
import { ClassSession } from 'src/entities/class-session.entity';
import { Child } from 'src/entities/child.entity';
import { Enrollment } from 'src/entities/enrollment.entity';
import { Lead } from 'src/entities/lead.entity';
import { AttendanceType } from 'src/enum/attendance-type.enum';
import { ClassSessionStatus } from 'src/enum/class-session-status.enum';
import { EnrollmentStatus } from 'src/enum/enrollment-status.enum';
import { markAttendanceDto } from './dto/markAttendance.dto';
import { AbsenceNoticeService } from './absence-notice.service';
import { LeadProgressService } from 'src/modules/lead/lead-progress.service';
import { EnrollmentService } from 'src/modules/enrollment/enrollment.service';
import { toIsoDate } from 'src/modules/class-session/class-session.dates';
import { bookingPhones } from 'src/modules/mail/booking-address';

/**
 * Whether an enrolment was a trial on a given day — E11/S4's rule, read the way billing reads it.
 * In `TRIAL` still, or decided later than that day: `trialUntil` is the day of the decision, and
 * nothing up to it, inclusive, was anything but the trial.
 */
export function wasTrialOn(enrollment: Pick<Enrollment, 'status' | 'trialUntil'>, day: string): boolean {
    return enrollment.status === EnrollmentStatus.TRIAL || (enrollment.trialUntil !== null && day <= enrollment.trialUntil);
}

@Injectable()
export class AttendanceService {
    constructor(
        @InjectRepository(Attendance) private readonly attendanceRepository: Repository<Attendance>,
        @InjectRepository(ClassSession) private readonly classSessionRepository: Repository<ClassSession>,
        @InjectRepository(Child) private readonly childRepository: Repository<Child>,
        @InjectRepository(Lead) private readonly leadRepository: Repository<Lead>,
        private readonly absenceNoticeService: AbsenceNoticeService,
        private readonly leadProgress: LeadProgressService,
        private readonly enrollments: EnrollmentService,
    ) {}

    /**
     * Who belongs on a class's register: the group **as it was on the class's day** — the review of
     * 26 September 2026.
     *
     * It was the group as it is today (`group.children`, the derived column), which is right for
     * today's class and wrong for every other one. Last week's register demanded a child who joined
     * this morning, and the family then saw a mark for a class held before their child was in the
     * group; a trial booked on `/proba` for next Monday sat on today's register as a regular pupil,
     * and today's register could not be saved without marking them. The enrolments answer the
     * question by date (`membersOn`), with the end day read as departed, like the billing does: a
     * child withdrawn this morning is not in this evening's class, and a child who starts today is.
     */
    private async membersAt(classSession: ClassSession): Promise<Map<number, Enrollment>> {
        const members = await this.enrollments.membersOn(classSession.group.id, toIsoDate(classSession.date));
        return new Map(members.map((enrollment) => [enrollment.child.id, enrollment]));
    }

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
            relations: { group: true },
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
        // Required: the group on the class's day, not today — see `membersAt`. Anyone else may be
        // posted (a visitor, a child added by hand) and is written as a make-up.
        const groupChildrenIds = [...(await this.membersAt(classSession)).keys()];
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
     *
     * And, since the review of 26 September 2026, two things a child booked on `/proba` lacked: the
     * phone number, which the booking left on the lead because the shell profile has none, and the
     * „Probă" marker the desktop register already drew — the teacher should know who is deciding
     * whether to stay, on the screen they actually hold.
     */
    async sessionRegister(classSessionId: number) {
        const classSession = await this.classSessionRepository.findOne({
            where: { id: classSessionId },
            relations: { group: true },
        });
        if (!classSession) {
            throw new NotFoundException(`Class session with ID ${classSessionId} does not exist`);
        }

        const marks = await this.attendanceRepository.find({
            where: { classSession: { id: classSessionId } },
            relations: { child: { parent: true, group: true } },
        });
        const markByChild = new Map(marks.map((mark) => [mark.child.id, mark]));
        const noticeByChild = await this.absenceNoticeService.forSession(classSessionId);
        // The group on the class's day (`membersAt`); everyone else on the register is there
        // because they have a mark on it or were moved into it for the week.
        const sessionDay = toIsoDate(classSession.date);
        const members = await this.membersAt(classSession);
        const groupChildIds = new Set(members.keys());
        const trialChildIds = new Set(
            [...members.values()].filter((enrollment) => wasTrialOn(enrollment, sessionDay)).map((enrollment) => enrollment.child.id),
        );
        const memberChildren =
            groupChildIds.size === 0
                ? []
                : await this.childRepository.find({ where: { id: In([...groupChildIds]) }, relations: { parent: true, group: true } });

        const entryOf = (child: Child, type: AttendanceType) => {
            const mark = markByChild.get(child.id);
            const notice = noticeByChild.get(child.id);
            return {
                childId: child.id,
                firstName: child.firstName,
                lastName: child.lastName,
                // For the tel: button. Absent when the profile has no phone — the screen shows
                // nothing rather than a button that dials nowhere. A `/proba` family's number is
                // filled in below, from the booking.
                parentPhone: child.parent?.phone ?? null,
                type,
                // In the group on a trial that day, E11/S4 — sitting there, and deciding.
                trial: trialChildIds.has(child.id),
                present: mark ? mark.present : null,
                attendanceId: mark ? mark.id : null,
                // What the family said, and whether they said it before the class — E12/S3.
                announcedAbsence: notice ? { reason: notice.reason, inTime: notice.inTime } : null,
                // A child from another group: the one they normally sit in, so the teacher knows
                // who the stranger is. Null for the group's own.
                visitingFrom: groupChildIds.has(child.id) ? null : (child.group?.name ?? null),
            };
        };

        const entries = [...memberChildren]
            .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
            .map((child) => entryOf(child, AttendanceType.REGULAR));
        // A make-up child is not in the group but already has a mark on this class; the register
        // still has to show them, or the screen would silently drop a row the bulk endpoint wrote.
        for (const mark of marks) {
            if (!groupChildIds.has(mark.child.id)) {
                entries.push(entryOf(mark.child, mark.type));
            }
        }
        // And the children the office moved here for the week who have no mark yet — E12/S4, the
        // end-to-end testing of 25 September 2026. The register listed a visitor only once they had
        // a mark, and the phone screen, the one a teacher marks from, offers no way to add anyone:
        // a moved child never appeared and could not be marked, because nothing on the screen knew
        // they were coming. Listed as their mark will be typed, `make-up`.
        const listed = new Set(entries.map((entry) => entry.childId));
        for (const notice of await this.absenceNoticeService.placedIn(classSessionId)) {
            if (listed.has(notice.child.id)) continue;
            listed.add(notice.child.id);
            entries.push(entryOf(notice.child, AttendanceType.MAKE_UP));
        }

        const withoutPhone = entries.filter((entry) => entry.parentPhone === null).map((entry) => entry.childId);
        const bookedPhones = await bookingPhones(this.leadRepository, withoutPhone);
        for (const entry of entries) {
            entry.parentPhone ??= bookedPhones.get(entry.childId) ?? null;
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
                // E12/S8: editable from the same screen, because the teacher in the room is the
                // one who knows whether this hour was a holiday one.
                isVacation: classSession.isVacation,
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
            relations: { group: true },
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
        // Same rule as the bulk endpoint: in the group on the class's day means regular, anyone else
        // is a make-up. The day, not today — a correction to last month's register is about who was
        // in the group last month.
        record.type = (await this.membersAt(classSession)).has(childId) ? AttendanceType.REGULAR : AttendanceType.MAKE_UP;
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
        const attendanceRecord = await this.attendanceRepository.findOne({
            where: { id: attendanceId },
            relations: { child: true, classSession: true },
        });

        if (!attendanceRecord) {
            throw new NotFoundException(`Attendance record with ID ${attendanceId} does not exist`);
        }
        attendanceRecord.present = present;
        const saved = await this.attendanceRepository.save(attendanceRecord);
        // The third way to write a mark, and it settles the lead like the other two: a trial held
        // is whatever the register says, by whichever route the register was corrected.
        await this.settleLead(attendanceRecord.child.id, attendanceRecord.classSession.id, present);
        return saved;
    }
}
