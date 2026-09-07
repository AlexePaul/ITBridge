import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AbsenceNotice } from 'src/entities/absence-notice.entity';
import { Attendance } from 'src/entities/attendance.entity';
import { AttendanceType } from 'src/enum/attendance-type.enum';
import { ClassSessionStatus } from 'src/enum/class-session-status.enum';
import { ArrearsService } from 'src/modules/invoice/arrears.service';
import { addDays, toIsoDate } from 'src/modules/class-session/class-session.dates';
import { OccupancyReportService } from './occupancy-report.service';
import { OCCUPANCY_THRESHOLD } from './reports.rules';
import {
    absenceStreak,
    attendanceTrend,
    CHILD_ABSENCE_STREAK,
    FAMILY_OVERDUE_INVOICES,
    familiesInArrears,
    GROUP_ATTENDANCE_DROP,
    GROUP_ATTENDANCE_WINDOW,
    isAbsenceSignal,
    isDecliningTrend,
    Mark,
    SessionRate,
    SIGNALS_LOOKBACK_DAYS,
    STALE_STREAK_AFTER_DAYS,
    streakSince,
} from './signals.rules';

/** A child who has stopped coming: their last marks are all absences, and the streak is live. */
export interface ChildAbsenceSignal {
    childId: number;
    childName: string;
    /** The group of the last mark — where the office would look for them. */
    groupId: number;
    groupName: string;
    parentId: number | null;
    parentName: string | null;
    phone: string | null;
    email: string | null;
    /** Absences in a row, at the end of the marks. */
    streak: number;
    /** The first absence of the run, `YYYY-MM-DD`. */
    since: string;
    lastMarkOn: string;
    /** How many of the run's absences the family had announced (E12/S3). An announced run is a different conversation. */
    announced: number;
}

/** A group whose room is emptier than it was: the last window of held sessions against the one before. */
export interface GroupAttendanceSignal {
    groupId: number;
    groupName: string;
    locationName: string;
    recentRate: number;
    previousRate: number;
    /** `previousRate - recentRate`. */
    drop: number;
    sessions: number;
    lastSessionOn: string;
}

/** A family two or more invoices behind, as the arrears list counts them. */
export interface FamilyArrearsSignal {
    parentId: number;
    parentName: string;
    email: string | null;
    phone: string | null;
    invoices: number;
    outstanding: number;
    oldestDaysOverdue: number;
}

/** A group under the occupancy line — the same rows the occupancy report flags, repeated here so the page is one list. */
export interface UnderfilledGroupSignal {
    groupId: number;
    groupName: string;
    locationName: string;
    taken: number;
    capacity: number;
    free: number;
    waiting: number;
    fillRate: number;
}

export interface EarlySignals {
    /** The day the signals are evaluated for — today, or a past day for the retrospective check. */
    asOf: string;
    /** First day the attendance signals read from: `asOf` minus the look-back. */
    lookbackFrom: string;
    generatedOn: string;
    /** The lines drawn, so the screen can name them. Every one a proposal — see `signals.rules.ts`. */
    thresholds: {
        childAbsenceStreak: number;
        staleStreakAfterDays: number;
        groupAttendanceWindow: number;
        groupAttendanceDrop: number;
        familyOverdueInvoices: number;
        occupancy: number;
    };
    children: ChildAbsenceSignal[];
    groups: GroupAttendanceSignal[];
    families: FamilyArrearsSignal[];
    underfilled: UnderfilledGroupSignal[];
    totals: {
        children: number;
        groups: number;
        families: number;
        underfilled: number;
        all: number;
    };
    /** What it was computed from — the report's own honesty about how complete the registers are. */
    basis: {
        marksRead: number;
        childrenWithMarks: number;
        sessionsWithRegister: number;
        /** Active groups with two full windows of held sessions — the only ones a trend can be read for. */
        groupsWithHistory: number;
        /** Seats are counted today whatever `asOf` says: enrolments carry no history a past day could be read from. */
        occupancyAsOfToday: boolean;
    };
}

/** One mark with the session it belongs to, as the two attendance signals read it. */
interface ReadMark extends Mark {
    sessionId: number;
    childId: number;
}

/**
 * The early signals — E21/S7.
 *
 * Four patterns, and each one is asked of whoever already owns the definition, as everything in
 * this module is. The two attendance patterns are new, so their definition is new too — and lives
 * in `signals.rules.ts`, pure, where the thresholds are read as proposals. Arrears come from
 * `ArrearsService.list`, which derives them from succeeded payments and does not trust the status
 * column; under-filled groups are the occupancy report's own rows, not a second count of seats.
 *
 * **`asOf` is the retrospective check.** The story asks that a fall in attendance raise a flag
 * *before* the child leaves, "verificat retroactiv pe datele istorice". Evaluating the marks and
 * the invoices as they stood on a past Monday is what makes that a question the office can ask of
 * the platform rather than of a spreadsheet: page back through the weeks and see whether the
 * families who then left were on this list in time. Seats cannot be read for a past day — an
 * enrolment is a period, but "taken" is asked live of `occupancyOf` — and the payload says so.
 */
@Injectable()
export class EarlySignalsService {
    constructor(
        @InjectRepository(Attendance) private readonly attendanceRepository: Repository<Attendance>,
        @InjectRepository(AbsenceNotice) private readonly noticeRepository: Repository<AbsenceNotice>,
        private readonly arrears: ArrearsService,
        private readonly occupancy: OccupancyReportService,
    ) {}

    async build(asOf: Date = new Date()): Promise<EarlySignals> {
        const asOfKey = toIsoDate(asOf);
        const lookbackFrom = toIsoDate(addDays(asOf, -SIGNALS_LOOKBACK_DAYS));

        const marks = await this.readMarks(lookbackFrom, asOfKey);
        const [children, groups, families, underfilled] = await Promise.all([
            this.childSignals(marks, asOfKey),
            Promise.resolve(this.groupSignals(marks)),
            this.familySignals(asOf),
            this.underfilledSignals(),
        ]);

        const sessionsWithRegister = new Set(marks.map((mark) => mark.classSession.id)).size;
        const childrenWithMarks = new Set(marks.map((mark) => mark.child.id)).size;

        return {
            asOf: asOfKey,
            lookbackFrom,
            generatedOn: toIsoDate(new Date()),
            thresholds: {
                childAbsenceStreak: CHILD_ABSENCE_STREAK,
                staleStreakAfterDays: STALE_STREAK_AFTER_DAYS,
                groupAttendanceWindow: GROUP_ATTENDANCE_WINDOW,
                groupAttendanceDrop: GROUP_ATTENDANCE_DROP,
                familyOverdueInvoices: FAMILY_OVERDUE_INVOICES,
                occupancy: OCCUPANCY_THRESHOLD,
            },
            children,
            groups: groups.signals,
            families,
            underfilled,
            totals: {
                children: children.length,
                groups: groups.signals.length,
                families: families.length,
                underfilled: underfilled.length,
                all: children.length + groups.signals.length + families.length + underfilled.length,
            },
            basis: {
                marksRead: marks.length,
                childrenWithMarks,
                sessionsWithRegister,
                groupsWithHistory: groups.withHistory,
                occupancyAsOfToday: true,
            },
        };
    }

    /**
     * Every regular mark in the window, with the session and the child it belongs to, in date
     * order. Make-up marks are left out: a visitor's presence in another group says nothing about
     * whether they are coming to their own, and `billable-sessions.rules.ts` reads them the same way.
     */
    private readMarks(from: string, to: string): Promise<Attendance[]> {
        return this.attendanceRepository
            .createQueryBuilder('mark')
            .innerJoinAndSelect('mark.classSession', 'session')
            .innerJoinAndSelect('session.group', 'sessionGroup')
            .leftJoinAndSelect('sessionGroup.room', 'room')
            .leftJoinAndSelect('room.location', 'location')
            .innerJoinAndSelect('mark.child', 'child')
            .leftJoinAndSelect('child.parent', 'parent')
            .andWhere('mark.type = :regular', { regular: AttendanceType.REGULAR })
            .andWhere('session.status != :cancelled', { cancelled: ClassSessionStatus.CANCELLED })
            .andWhere('session.date >= :from AND session.date <= :to', { from, to })
            .orderBy('session.date', 'ASC')
            .addOrderBy('session.startTime', 'ASC')
            .addOrderBy('mark.id', 'ASC')
            .getMany();
    }

    /**
     * The children whose last marks are all absences.
     *
     * Read per child across every group they were marked in, because a transfer mid-streak is
     * still a streak. Whether the run is live is judged by the last mark's age, not by a current
     * enrolment: a child who withdrew last month has no live run, and a child evaluated on a past
     * Monday had one then — which is the whole point of `asOf`.
     */
    private async childSignals(marks: Attendance[], asOf: string): Promise<ChildAbsenceSignal[]> {
        const byChild = new Map<number, { child: Attendance['child']; marks: ReadMark[]; last: Attendance }>();
        for (const mark of marks) {
            const entry = byChild.get(mark.child.id) ?? { child: mark.child, marks: [], last: mark };
            entry.marks.push({ date: toIsoDate(mark.classSession.date), present: mark.present, sessionId: mark.classSession.id, childId: mark.child.id });
            entry.last = mark;
            byChild.set(mark.child.id, entry);
        }

        const flagged = [...byChild.values()].filter((entry) => isAbsenceSignal(entry.marks, asOf));
        if (flagged.length === 0) return [];

        // Which of the run's absences the family had announced — one query for all of them, keyed
        // on the (child, session) pair the notice is unique on.
        const notices = await this.noticeRepository
            .createQueryBuilder('notice')
            .innerJoin('notice.child', 'child')
            .innerJoin('notice.classSession', 'session')
            .addSelect(['child.id', 'session.id'])
            .andWhere('child.id IN (:...childIds)', { childIds: flagged.map((entry) => entry.child.id) })
            .getMany();
        const announced = new Set(notices.map((notice) => `${notice.child.id}:${notice.classSession.id}`));

        return flagged
            .map((entry): ChildAbsenceSignal => {
                const streak = absenceStreak(entry.marks);
                const run = entry.marks.slice(-streak);
                const parent = entry.child.parent ?? null;
                const group = entry.last.classSession.group;
                return {
                    childId: entry.child.id,
                    childName: `${entry.child.firstName} ${entry.child.lastName}`,
                    groupId: group.id,
                    groupName: group.name,
                    parentId: parent?.id ?? null,
                    parentName: parent ? `${parent.firstName} ${parent.lastName}` : null,
                    phone: parent?.phone ?? null,
                    email: parent?.email ?? null,
                    streak,
                    since: streakSince(entry.marks) ?? run[0].date,
                    lastMarkOn: run[run.length - 1].date,
                    announced: run.filter((mark) => announced.has(`${mark.childId}:${mark.sessionId}`)).length,
                };
            })
            .sort((a, b) => b.streak - a.streak || b.lastMarkOn.localeCompare(a.lastMarkOn) || a.childName.localeCompare(b.childName));
    }

    /**
     * The active groups whose last window of held sessions is emptier than the one before.
     *
     * A session is held when it has a register (E15/S9's rule), and its rate is present over
     * marked. Groups without two full windows are counted in `basis` and not judged: three weeks
     * of history against nothing is not a fall.
     */
    private groupSignals(marks: Attendance[]): { signals: GroupAttendanceSignal[]; withHistory: number } {
        const sessions = new Map<number, SessionRate & { group: Attendance['classSession']['group'] }>();
        for (const mark of marks) {
            const session = mark.classSession;
            const entry = sessions.get(session.id) ?? { date: toIsoDate(session.date), present: 0, marked: 0, group: session.group };
            entry.marked += 1;
            if (mark.present) entry.present += 1;
            sessions.set(session.id, entry);
        }

        const byGroup = new Map<number, { group: Attendance['classSession']['group']; rows: SessionRate[] }>();
        for (const entry of sessions.values()) {
            if (!entry.group.isActive) continue;
            const rows = byGroup.get(entry.group.id) ?? { group: entry.group, rows: [] };
            rows.rows.push({ date: entry.date, present: entry.present, marked: entry.marked });
            byGroup.set(entry.group.id, rows);
        }

        let withHistory = 0;
        const signals: GroupAttendanceSignal[] = [];
        for (const { group, rows } of byGroup.values()) {
            rows.sort((a, b) => a.date.localeCompare(b.date));
            const trend = attendanceTrend(rows);
            if (trend === null) continue;
            withHistory += 1;
            if (!isDecliningTrend(trend)) continue;
            signals.push({
                groupId: group.id,
                groupName: group.name,
                locationName: group.room?.location?.name ?? '',
                recentRate: trend.recent,
                previousRate: trend.previous,
                drop: trend.drop,
                sessions: trend.sessions,
                lastSessionOn: trend.lastSessionOn,
            });
        }
        signals.sort((a, b) => b.drop - a.drop || a.groupName.localeCompare(b.groupName));
        return { signals, withHistory };
    }

    /** Families two or more invoices past due, from the arrears list as it stood on `asOf`. */
    private async familySignals(asOf: Date): Promise<FamilyArrearsSignal[]> {
        const rows = await this.arrears.list(asOf);
        const names = new Map(rows.map((row) => [row.parentId, { name: row.parentName, email: row.email, phone: row.phone }]));
        return familiesInArrears(rows).map((family) => {
            const who = names.get(family.parentId);
            return {
                parentId: family.parentId,
                parentName: who?.name ?? '',
                email: who?.email ?? null,
                phone: who?.phone ?? null,
                invoices: family.invoices,
                outstanding: family.outstanding,
                oldestDaysOverdue: family.oldestDaysOverdue,
            };
        });
    }

    /** The occupancy report's own under-threshold rows, emptiest first — its definition, not a second one. */
    private async underfilledSignals(): Promise<UnderfilledGroupSignal[]> {
        const report = await this.occupancy.build();
        return report.groups
            .filter((group) => group.underThreshold)
            .map((group) => ({
                groupId: group.groupId,
                groupName: group.name,
                locationName: group.locationName,
                taken: group.taken,
                capacity: group.capacity,
                free: group.free,
                waiting: group.waiting,
                fillRate: group.fillRate,
            }));
    }
}
