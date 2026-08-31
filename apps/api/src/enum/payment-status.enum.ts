/**
 * The life of one recorded payment — E16/S1.
 *
 * The states keep their point even with no card processor: propagation to SmartBill can fail, and a
 * cash sum can be counted wrong and reversed. A payment recorded here and never confirmed anywhere
 * else must be visible as such, not look settled.
 *
 * Only SUCCEEDED counts toward an invoice being paid — the derivation in `PaymentService` sums
 * nothing else.
 */
export enum PaymentStatus {
    /** Announced but not yet confirmed — a transfer the parent says was sent. */
    INITIATED = 'initiated',
    /** The money is here. The only state that pays an invoice down. */
    SUCCEEDED = 'succeeded',
    /** It never arrived. Kept as a row because the attempt is part of the story. */
    FAILED = 'failed',
    /** It arrived and went back — a refund or a miscount. */
    REVERSED = 'reversed',
}
