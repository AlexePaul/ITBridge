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
