/**
 * Where a child's participation in a group stands — E11/S1.
 *
 * The first two are the ones that matter to everything else: they are the states **in force**, and
 * a child may be in at most one of them at a time (D6). The other three are history, and a child
 * can accumulate as many of them as the years allow.
 */
export enum EnrollmentStatus {
    /**
     * A trial lesson, booked or held, with no decision yet.
     *
     * In force, and therefore **occupying a seat** — D7. A trial child sits on a chair, at a
     * computer, in the same room; free of charge is not free of cost. This is the single most
     * load-bearing thing about the status, and the reason it is not merely a flag on `ACTIVE`.
     */
    TRIAL = 'TRIAL',
    /** Enrolled and attending. In force. */
    ACTIVE = 'ACTIVE',
    /** Ran its course. History. */
    COMPLETED = 'COMPLETED',
    /** The family stopped coming, whatever the reason written in `exitReason`. History. */
    WITHDRAWN = 'WITHDRAWN',
    /** Closed because the child moved to another group; the new row carries on. History — E11/S5. */
    TRANSFERRED = 'TRANSFERRED',
}

/**
 * The statuses that hold a seat and block a second enrolment.
 *
 * Written once, here, because three separate places ask the question — the uniqueness rule, the
 * capacity count, and the "is this child enrolled" lookup — and a list copied three times is a list
 * that will eventually disagree with itself about trials.
 */
export const IN_FORCE_STATUSES: readonly EnrollmentStatus[] = [EnrollmentStatus.TRIAL, EnrollmentStatus.ACTIVE];

export function isInForce(status: EnrollmentStatus): boolean {
    return IN_FORCE_STATUSES.includes(status);
}
