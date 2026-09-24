import { InvoiceFiscalStatus } from 'src/entities/invoice.entity';
import type { SmartBillMode } from 'src/modules/smartbill/smartbill.config';

/**
 * The fiscal queue's arithmetic — E16/S2 and S3. Pure, so the timing can be asserted without a
 * database or a clock behind it.
 */

/**
 * How long a request may be in the air before the queue treats it as unanswered.
 *
 * Longer than `ISSUE_TIMEOUT_MS` with room to spare: a lease that ran out while the answer was still
 * on its way would let a second pass decide "not issued" about an invoice that was. Two minutes is
 * a request, a slow answer and the bookkeeping after it.
 */
export const FISCAL_LEASE_MS = 2 * 60 * 1000;

/**
 * How many rows one pass takes on, one at a time.
 *
 * A pass is at most one series read, one request per row and one PDF read per issued row, spaced
 * `MIN_CALL_GAP_MS` apart: twenty rows is about forty calls over sixteen seconds, under the limit
 * of thirty per ten seconds with the margin the lock-out deserves. A hundred families is five
 * passes, two and a half minutes, and nobody waits on any of it — S3's "nu blocheaza interfata".
 */
export const FISCAL_BATCH_SIZE = 20;

/**
 * The attempts a row gets before it is handed to a person.
 *
 * Only requests that went up and came back unanswered count; a refusal stops at once (it would
 * refuse again), and a configuration failure or a lock-out gives the attempt back, the way the
 * outbox does for a missing mail key. Seven, with the backoff below, is about two hours of SmartBill
 * not answering — long past a blip, well short of a month-end left waiting.
 */
export const FISCAL_MAX_ATTEMPTS = 7;

/** Doubling from two minutes, capped at an hour. `attempts` counts the one just made. */
export function fiscalBackoffFrom(now: Date, attempts: number): Date {
    const delay = Math.min(2 * 60 * 1000 * 2 ** Math.max(0, attempts - 1), 60 * 60 * 1000);
    return new Date(now.getTime() + delay);
}

/** When a configuration problem is waiting to be fixed: often enough to notice the fix, rarely enough not to nag. */
export const CONFIGURATION_RETRY_MS = 5 * 60 * 1000;

/**
 * What a freshly issued invoice starts as.
 *
 * Queued when there is something to send: a mode that sends, and money on the invoice. A waived
 * month has no document by design — nothing to print, nobody to ask for money (E15) — so it has no
 * fiscal state either. In `off` the column stays `null`: the invoice was never meant for SmartBill,
 * and switching the mode on later does not reach back for it (E15's rule on old invoices).
 */
export function fiscalStateAtIssue(
    amount: number,
    mode: SmartBillMode,
    now: Date,
): { fiscalStatus: InvoiceFiscalStatus | null; fiscalNextAttemptAt: Date | null } {
    if (mode === 'off' || amount <= 0) {
        return { fiscalStatus: null, fiscalNextAttemptAt: null };
    }
    return { fiscalStatus: InvoiceFiscalStatus.PENDING, fiscalNextAttemptAt: now };
}

/**
 * Whether the platform still writes its own PDF for an invoice issued in this mode.
 *
 * Not in `live`: the fiscal PDF is SmartBill's (E15/S7), and a second document for the same month —
 * with no series and no number — is exactly the "document that is not an invoice" E16 opens with.
 * In `draft` it is: a draft is not an invoice, and the family still needs something to read.
 */
export function writesLocalPdf(mode: SmartBillMode): boolean {
    return mode !== 'live';
}
