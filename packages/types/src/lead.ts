import type { ISODate, ISODateTime } from './common';

/**
 * Acquisition — E20/S1 to S4.
 *
 * The shape that matters most here is what a **public** caller sends and receives: `POST /trial/bookings`
 * is the only write in this contract that nobody signs in for. It is not an enrolment and must never
 * read as one — the school's decision is that enrolment stays an admin's job, so nothing below
 * promises a place in a group or an account.
 */

/** Mirrors `LeadStatus` in `apps/api/src/enum/lead-status.enum.ts`. */
export type LeadStatus = 'new' | 'contacted' | 'trial_scheduled' | 'trial_held' | 'enrolled' | 'lost';

/** Mirrors `LeadSource` — how the request reached the school, always known. */
export type LeadSource = 'trial_form' | 'phone' | 'walk_in' | 'referral' | 'other';

/**
 * Mirrors `LeadChannel` — where the family says they heard about the school.
 *
 * Self-declared, and the report says so: E20/S5 decided against referral codes, so `friend` is a
 * parent's word rather than an attribution.
 */
export type LeadChannel = 'google' | 'facebook' | 'instagram' | 'friend' | 'flyer' | 'passing_by' | 'other';

// ---- the public booking form ---------------------------------------------------------------

/** One class a parent can pick, with the dates it actually runs on in the next three weeks. */
export interface TrialSlot {
    groupId: number;
    groupName: string;
    /** ISO weekday, 1 = Monday. */
    weekday: number;
    startTime: string;
    endTime: string;
    locationId: number;
    locationName: string;
    address: string;
    sessions: { id: number; date: ISODate }[];
}

export interface BookTrialDto {
    parentName: string;
    /** One of these two is required; the API refuses a booking with neither. */
    parentEmail?: string;
    parentPhone?: string;
    childFirstName: string;
    childLastName: string;
    childBirthDate: ISODate;
    experience?: string;
    channel?: LeadChannel;
    locationId?: number;
    /** Left out when no offered hour suited: the request is kept, marked "no seats". */
    classSessionId?: number;
}

/**
 * What a booking answers.
 *
 * `no_seats` is not an error, and the page must not render it as one: it means the family is on
 * file and somebody will ring them. It comes back both when the parent found no hour to pick and
 * when the last seat went while they were filling the form in.
 */
export interface TrialBookingResult {
    status: 'booked' | 'no_seats';
    leadId: number;
    trial?: { date: ISODate; startTime: string; groupName: string; locationName: string };
}

// ---- the office ------------------------------------------------------------------------------

export interface LeadSummary {
    id: number;
    status: LeadStatus;
    source: LeadSource;
    channel: LeadChannel | null;
    parentName: string;
    parentEmail: string | null;
    parentPhone: string | null;
    childFirstName: string;
    childLastName: string;
    childBirthDate: ISODate;
    experience: string | null;
    /** True when nobody had a seat: the measure of demand the school could not serve. */
    noSeats: boolean;
    lostReason: string | null;
    notes: string | null;
    nextActionAt: ISODate | null;
    lastActivityAt: ISODateTime;
    trialHeldAt: ISODateTime | null;
    decidedAt: ISODateTime | null;
    createdAt: ISODateTime;
    location: { id: number; name: string } | null;
    group: { id: number; name: string } | null;
    trialSession: { id: number; date: ISODate; startTime: string } | null;
    assignedTo: { id: number; username: string } | null;
}

/** A lead with how long it has been waiting, in whole calendar days. */
export interface LeadWithAge {
    lead: LeadSummary;
    days: number;
}

/** The four lists the daily office message is made of — E20/S3. */
export interface LeadFollowUp {
    undecided: LeadWithAge[];
    noSeats: LeadWithAge[];
    stale: LeadWithAge[];
    due: LeadWithAge[];
    unassigned: number;
}

export interface CreateLeadDto {
    parentName: string;
    parentEmail?: string;
    parentPhone?: string;
    childFirstName: string;
    childLastName: string;
    childBirthDate: ISODate;
    experience?: string;
    source: LeadSource;
    channel?: LeadChannel;
    locationId?: number;
    notes?: string;
    nextActionAt?: ISODate;
}

/**
 * Notice what is missing: `status`.
 *
 * Four of the six statuses are consequences of something else — the register, an enrolment in E11 —
 * and the two a person declares have endpoints of their own. A status field here would let a screen
 * write `enrolled` on a family nobody enrolled, and that is the number the funnel is built on.
 */
export interface UpdateLeadDto {
    parentEmail?: string;
    parentPhone?: string;
    channel?: LeadChannel;
    notes?: string;
    nextActionAt?: ISODate;
    clearNextAction?: boolean;
    assignedToId?: number;
    unassign?: boolean;
}

export interface LoseLeadDto {
    reason: string;
}

// ---- the funnel ------------------------------------------------------------------------------

/**
 * E20/S4. The cohort is by arrival: a family who asked in August and enrolled in September is
 * counted in August, on both lines.
 */
export interface LeadFunnel {
    range: { from: ISODate; to: ISODate };
    stages: {
        requests: number;
        trialsScheduled: number;
        trialsHeld: number;
        enrolled: number;
        lost: number;
        /** Requests nobody had a seat for. They never enter a conversion rate — that is the point. */
        noSeats: number;
    };
    /** Percentages, one decimal place. */
    rates: {
        requestToTrial: number;
        trialToAttendance: number;
        /** The one the epic calls most important — and which measures the class *and* the follow-up. */
        attendanceToEnrolment: number;
    };
    /**
     * Days from the trial to somebody deciding. Read it beside `attendanceToEnrolment`: if the rate
     * falls while this rises, the problem is the follow-up list, not the class.
     */
    medianDaysToDecision: number | null;
    bySource: { key: string; requests: number; enrolled: number }[];
    byChannel: { key: string; requests: number; enrolled: number }[];
    byLocation: {
        locationId: number | null;
        locationName: string;
        requests: number;
        enrolled: number;
        noSeats: number;
    }[];
    unmetByBand: { locationId: number | null; locationName: string; ageBand: string; count: number }[];
}
