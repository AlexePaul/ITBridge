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
