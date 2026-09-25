/** Where a request for a seat in a full group stands — E11/S3. */
export enum WaitlistStatus {
    /** On the list, nothing offered yet. The only status that gets offered a freed seat. */
    WAITING = 'WAITING',
    /** A seat came free and the family was told. The clock in `respondBy` is running. */
    OFFERED = 'OFFERED',
    /** They took it. An enrolment exists from here on, and this row is history. */
    ACCEPTED = 'ACCEPTED',
    /** They said no. The seat goes back to whoever is next. */
    DECLINED = 'DECLINED',
    /** Offered and never answered by `respondBy`. Same effect as declining, different story. */
    EXPIRED = 'EXPIRED',
    /** Taken off the list by the school or by the family, before any offer. */
    CANCELLED = 'CANCELLED',
}

/**
 * The ways an entry leaves the list by somebody's hand — `DELETE /enrollments/waitlist/:id`.
 *
 * A list rather than the whole enum: the route took any status, so `OFFERED` sent to it made an
 * offer with no `respondBy`, which the sweep (`respondBy < now`) could never expire — a seat held
 * for good. `WAITING` and `ACCEPTED` are not answers a family gives either; the first is the list
 * itself, the second is being enrolled.
 */
export const WAITLIST_CLOSING_STATUSES = [WaitlistStatus.DECLINED, WaitlistStatus.EXPIRED, WaitlistStatus.CANCELLED] as const;
export type WaitlistClosingStatus = (typeof WAITLIST_CLOSING_STATUSES)[number];
