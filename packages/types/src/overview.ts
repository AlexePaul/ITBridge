import type { ISODate, TimeOfDay } from './common';

/**
 * The one screen that answers „cum stăm?" — E21/S1.
 *
 * Every number here is asked of whoever already owns the question: unmarked registers from the
 * timetable, arrears from the invoices, occupancy from the enrolments. Nothing is re-derived, which
 * is why nothing here can drift from the screen it summarises.
 */

/** One of today's classes. */
export interface OverviewSession {
    id: number;
    groupName: string;
    startTime: TimeOfDay;
    endTime: TimeOfDay;
    locationName: string | null;
    /** Whether anybody has taken the register — the whole point of the row. */
    marked: boolean;
}

/** A group with a seat or less left. Occupancy counts trials, per D7. */
export interface OverviewGroup {
    groupId: number;
    name: string;
    locationName: string | null;
    capacity: number;
    taken: number;
    free: number;
}

export interface Overview {
    /** The school's own day. */
    date: ISODate;
    today: {
        sessions: OverviewSession[];
        marked: number;
        total: number;
    };
    /** Registers still missing from the week behind today. Today is left out: it is work in progress. */
    unmarkedThisWeek: number;
    arrears: {
        /** Families, not invoices: one family with two unpaid months is one phone call. */
        families: number;
        outstanding: number;
        /** Past the point where the platform stops writing and somebody has to phone. */
        over60: number;
    };
    groupsNearlyFull: OverviewGroup[];
    /** Uploaded, reviewed by nobody, sent to nobody. */
    projectsAwaitingSend: number;
    /** Families who registered and are waiting to be let in. */
    pendingApprovals: number;
    /** Messages that had nowhere to go — a family not reached, who does not know it. */
    undeliverableMessages: number;
}
