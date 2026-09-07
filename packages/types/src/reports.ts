import type { BillingMonth, ISODate, TimeOfDay } from './common';
import type { ArrearsBucket } from './invoice';

/**
 * The reports — E21/S2 (money) and S4 (seats).
 *
 * Read-only aggregates. Like the overview, nothing here is a definition of its own: ageing comes
 * from the arrears list, seats from the enrolments, and this file only names the sums.
 */

/** Money received, split by how it arrived. */
export interface CollectedByMethod {
    cash: number;
    bankTransfer: number;
}

/** One billing month. A month with no invoices is still a row, with zeros. */
export interface FinanceMonth {
    month: BillingMonth;
    /** Amounts on the month's billable invoices. `waived` rows carry no money and are not in here. */
    invoiced: number;
    invoices: number;
    /** Months settled at zero — counted, not summed. */
    waived: number;
    /** Distinct families billed for the month. */
    families: number;
    /** Succeeded payments **against this month's invoices**, whenever they arrived. */
    collectedForMonth: number;
    /** What the month's invoices still owe, floored per invoice at zero. */
    outstanding: number;
    /** Succeeded payments **dated inside this calendar month**, for whichever month — what the bank saw. */
    collectedInMonth: number;
    /** The split of `collectedInMonth`. */
    byMethod: CollectedByMethod;
    averagePerFamily: number;
}

export interface FinanceArrears {
    families: number;
    outstanding: number;
    byBucket: Record<ArrearsBucket, { invoices: number; outstanding: number }>;
}

/** What the numbers rest on, so a reader can judge how complete they are. */
export interface FinanceBasis {
    billableInvoices: number;
    waivedInvoices: number;
    succeededPayments: number;
    /** Announced but not landed. Counted nowhere above. */
    initiatedPayments: number;
    /** Came and went back. Counted nowhere above. */
    reversedPayments: number;
    failedPayments: number;
}

export interface FinanceReport {
    from: BillingMonth;
    to: BillingMonth;
    /** The day it was computed; arrears age against it. */
    generatedOn: ISODate;
    months: FinanceMonth[];
    totals: {
        invoiced: number;
        invoices: number;
        waived: number;
        /** Distinct across the whole range. */
        families: number;
        collectedForMonth: number;
        outstanding: number;
        collectedInMonth: number;
        byMethod: CollectedByMethod;
        averagePerFamily: number;
    };
    arrears: FinanceArrears;
    basis: FinanceBasis;
}

/** A weekly slot in the timetable. */
export interface TimetableSlot {
    weekday: number;
    startTime: TimeOfDay;
    endTime: TimeOfDay;
}

export interface OccupancyGroup {
    groupId: number;
    name: string;
    weekday: number;
    startTime: TimeOfDay;
    endTime: TimeOfDay;
    roomId: number;
    roomName: string;
    locationId: number;
    locationName: string;
    capacity: number;
    /** Enrolments in force — active plus trials, per D7. */
    taken: number;
    free: number;
    waiting: number;
    /** `taken / capacity`, two decimals. */
    fillRate: number;
    underThreshold: boolean;
    /** `free × ratePerSeat` — an estimate at list price. */
    lostRevenueMonthly: number;
}

export interface OccupancyRoom {
    roomId: number;
    roomName: string;
    locationId: number;
    locationName: string;
    roomCapacity: number;
    groups: number;
    capacity: number;
    taken: number;
    free: number;
    fillRate: number;
    /** Hours some other room teaches in while this one stands empty. */
    deadSlots: TimetableSlot[];
}

export interface OccupancyLocation {
    locationId: number;
    name: string;
    rooms: number;
    groups: number;
    capacity: number;
    taken: number;
    free: number;
    waiting: number;
    fillRate: number;
    lostRevenueMonthly: number;
}

export interface OccupancyReport {
    generatedOn: ISODate;
    /** The fill rate under which a group is flagged. */
    threshold: number;
    /** Lei per empty seat per month, at list price. */
    ratePerSeat: number;
    /** Least full first. */
    groups: OccupancyGroup[];
    rooms: OccupancyRoom[];
    locations: OccupancyLocation[];
    totals: {
        groups: number;
        capacity: number;
        taken: number;
        free: number;
        waiting: number;
        fillRate: number;
        underThreshold: number;
        lostRevenueMonthly: number;
        /** The distinct hours the school teaches in — the grid dead hours are measured against. */
        slotsInUse: TimetableSlot[];
    };
}

/** A child who has stopped coming — E21/S7: their last marks are all absences, and the run is live. */
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
    /** The first absence of the run. */
    since: ISODate;
    lastMarkOn: ISODate;
    /** How many of the run's absences the family had announced (E12/S3). */
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
    lastSessionOn: ISODate;
}

/** A family two or more invoices past due, as the arrears list counts them. */
export interface FamilyArrearsSignal {
    parentId: number;
    parentName: string;
    email: string | null;
    phone: string | null;
    invoices: number;
    outstanding: number;
    oldestDaysOverdue: number;
}

/** A group under the occupancy line — the occupancy report's own flag, repeated so the page is one list. */
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

/**
 * What `GET /reports/signals` answers — E21/S7.
 *
 * Four lists, the lines they were drawn with (every one a proposal), totals, and what it was all
 * computed from. `asOf` is the day the marks and the invoices were read as of; seats are always
 * today's, and `basis.occupancyAsOfToday` says so.
 */
export interface EarlySignals {
    asOf: ISODate;
    lookbackFrom: ISODate;
    generatedOn: ISODate;
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
    basis: {
        marksRead: number;
        childrenWithMarks: number;
        sessionsWithRegister: number;
        groupsWithHistory: number;
        occupancyAsOfToday: boolean;
    };
}
