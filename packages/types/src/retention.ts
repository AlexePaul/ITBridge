/**
 * The retention term on the wire — E04/S5 and E22/S3.
 *
 * A family the school recorded as gone keeps its data for a stated term, then really goes. The
 * terms travel with the list so the screen names the number the server counts with, instead of
 * printing a second copy of it that could drift.
 */

/** Why a family whose term has come is not erased yet — each waits on a different person. */
export type RetentionHold = 'enrolment_in_force' | 'on_waitlist' | 'owes_money';

/** One withdrawn family: when it left, when it goes, and what keeps it. Days are `YYYY-MM-DD`. */
export interface RetentionRow {
    profileId: number;
    firstName: string;
    lastName: string;
    withdrawnAt: string;
    dueOn: string;
    /** The term has come; with no hold, the next nightly pass erases the family. */
    due: boolean;
    hold: RetentionHold | null;
}

/** The terms the server counts with, in the units a person reads them in. */
export interface RetentionTerms {
    familyMonths: number;
    enquiryMonths: number;
    messageMonths: number;
    expiredLinkDays: number;
}

/** The office's list, with the terms it was counted by. */
export interface RetentionSchedule {
    terms: RetentionTerms;
    rows: RetentionRow[];
}

/** One family's side of it: its row while it is withdrawn, `null` while it is not. */
export interface FamilyRetention {
    terms: RetentionTerms;
    row: RetentionRow | null;
}

/** Recording a withdrawal: the day, or today when left out. */
export interface WithdrawFamilyRequest {
    withdrawnOn?: string;
}
