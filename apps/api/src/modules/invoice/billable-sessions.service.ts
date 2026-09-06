import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Attendance } from 'src/entities/attendance.entity';
import { ClassSession } from 'src/entities/class-session.entity';
import { Enrollment } from 'src/entities/enrollment.entity';
import { EnrollmentStatus } from 'src/enum/enrollment-status.enum';
import { toIsoDate } from 'src/modules/class-session/class-session.dates';
import { teachingMonthRange } from './billing-period.rules';
import { BillableCount, BillableSession, billableSessionsFor, unmarkedSessions } from './billable-sessions.rules';

/** One session of the month with nobody marked — the list above the issuing screen. */
export interface UnmarkedSession {
    sessionId: number;
    groupId: number;
    groupName: string;
    date: string;
    startTime: string;
}

/** A child who was enrolled, not on trial, for at least one day of the month. */
export interface BillableChild {
    childId: number;
    firstName: string;
    lastName: string;
    parentId: number;
    /** The group of the child's latest enrolment in the month — what the row is labelled with. */
    groupId: number;
    groupName: string;
    weekday: number;
}

export interface MonthCount {
    month: string;
    /** First and last day the month covers, both inclusive — E15/S9, the week rule. */
    from: string;
    to: string;
    counts: Map<number, BillableCount>;
    children: BillableChild[];
    unmarked: UnmarkedSession[];
}

/**
 * The one query that feeds the rule — E15/S9.
 *
 * **A single place counts.** The worksheet, the issuing call and one day the reports all ask this
 * service the same question and get the same answer. A second count would be the one that
 * diverges, and the wrong one would always be the one nobody reads.
 *
 * The month is the *teaching* month: the weeks whose Monday falls in it (`teachingMonthRange`).
 * Sessions are read for that range, marks for those sessions, and enrolments that overlap the
 * range by even one day — the rule itself then decides, per child, what each session is worth.
 */
@Injectable()
export class BillableSessionsService {
    constructor(
        @InjectRepository(ClassSession) private readonly sessionRepository: Repository<ClassSession>,
        @InjectRepository(Attendance) private readonly attendanceRepository: Repository<Attendance>,
        @InjectRepository(Enrollment) private readonly enrollmentRepository: Repository<Enrollment>,
    ) {}

    async countForMonth(month: string): Promise<MonthCount> {
        const { from, to } = teachingMonthRange(month);

        const sessions = await this.sessionRepository
            .createQueryBuilder('session')
            .leftJoinAndSelect('session.group', 'group')
            .andWhere('session.date >= :from AND session.date <= :to', { from, to })
            .orderBy('session.date', 'ASC')
            .addOrderBy('session.startTime', 'ASC')
            .getMany();

        const sessionIds = sessions.map((session) => session.id);
        const marks =
            sessionIds.length === 0
                ? []
                : await this.attendanceRepository
                      .createQueryBuilder('mark')
                      .leftJoinAndSelect('mark.child', 'child')
                      .leftJoinAndSelect('mark.classSession', 'session')
                      .andWhere('session.id IN (:...sessionIds)', { sessionIds })
                      .getMany();

        // Every enrolment that touches the month, in any state but trial: a child who left on the
        // 15th still owes what was held before it. Sorted so the latest one per child comes last,
        // which is the group the worksheet labels them with.
        const enrollments = await this.enrollmentRepository
            .createQueryBuilder('enrollment')
            .leftJoinAndSelect('enrollment.child', 'child')
            .leftJoinAndSelect('child.parent', 'parent')
            .leftJoinAndSelect('enrollment.group', 'group')
            .andWhere('enrollment.status != :trial', { trial: EnrollmentStatus.TRIAL })
            .andWhere('enrollment.startDate <= :to', { to })
            .andWhere('(enrollment.endDate IS NULL OR enrollment.endDate >= :from)', { from })
            .orderBy('enrollment.startDate', 'ASC')
            .getMany();

        const billableSessions: BillableSession[] = sessions.map((session) => ({
            id: session.id,
            groupId: session.group.id,
            date: toIsoDate(session.date),
            isVacation: session.isVacation,
            status: session.status,
        }));

        const counts = billableSessionsFor(
            billableSessions,
            marks.map((mark) => ({ sessionId: mark.classSession.id, childId: mark.child.id, present: mark.present, type: mark.type })),
            enrollments.map((enrollment) => ({
                childId: enrollment.child.id,
                groupId: enrollment.group.id,
                status: enrollment.status,
                startDate: toIsoDate(enrollment.startDate),
                endDate: enrollment.endDate === null ? null : toIsoDate(enrollment.endDate),
            })),
        );

        const children = new Map<number, BillableChild>();
        for (const enrollment of enrollments) {
            if (!enrollment.child.parent) continue;
            children.set(enrollment.child.id, {
                childId: enrollment.child.id,
                firstName: enrollment.child.firstName,
                lastName: enrollment.child.lastName,
                parentId: enrollment.child.parent.id,
                groupId: enrollment.group.id,
                groupName: enrollment.group.name,
                weekday: enrollment.group.weekday,
            });
        }

        const groupName = new Map(sessions.map((session) => [session.id, session.group.name]));
        const startTime = new Map(sessions.map((session) => [session.id, session.startTime]));
        const unmarked = unmarkedSessions(
            billableSessions,
            marks.map((mark) => ({ sessionId: mark.classSession.id, childId: mark.child.id, present: mark.present, type: mark.type })),
        ).map((session) => ({
            sessionId: session.id,
            groupId: session.groupId,
            groupName: groupName.get(session.id) ?? '',
            date: session.date,
            startTime: startTime.get(session.id) ?? '',
        }));

        return { month, from, to, counts, children: [...children.values()], unmarked };
    }
}
