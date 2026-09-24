import { PaymentFiscalStatus } from 'src/entities/payment.entity';
import { PaymentStatus } from 'src/enum/payment-status.enum';

/**
 * When the platform and SmartBill disagree about an invoice — E16/S8, the second half of the story:
 * "o verificare periodică între platformă și SmartBill: orice factură cu stări divergente între cele
 * două sisteme e semnalată".
 *
 * Pure, and the only definition of "divergent": the report reads it, nothing else computes it. What
 * it judges is SmartBill's side **as last read** against the platform's side **as it is now**, so a
 * figure read before a payment was recorded would be a false alarm — which is why recording a
 * payment clears the invoice's check, and an unchecked invoice is never judged.
 */

/** A day between two reads of the same invoice: often enough that a month-end surprise cannot happen. */
export const DIVERGENCE_CHECK_EVERY_MS = 24 * 60 * 60 * 1000;

/** Invoices read per pass. One read each, paced by `SmartBillService` like every other call. */
export const DIVERGENCE_BATCH_SIZE = 20;

/**
 * What can be wrong, each with a different person and place to fix it:
 *
 *  - `missing_in_smartbill` — SmartBill no longer knows the number: deleted or cancelled there.
 *  - `total_differs` — SmartBill's total is not the platform's amount. E15/S7 promised they match to
 *    the leu; a difference means somebody edited the document in SmartBill.
 *  - `changed_in_smartbill` — SmartBill counts a different sum as collected than the platform ever
 *    recorded there: money entered or removed by hand in SmartBill Cloud.
 *  - `reversed_still_recorded` — a payment reversed here is still a collection there; somebody
 *    deletes it in SmartBill.
 *  - `not_recorded` — money received here that SmartBill refused, or whose lost answer waits on a
 *    person.
 */
export type DivergenceReason = 'missing_in_smartbill' | 'total_differs' | 'changed_in_smartbill' | 'reversed_still_recorded' | 'not_recorded';

export interface DivergenceInput {
    /** The platform's invoice total. */
    amount: number;
    /** SmartBill's figures as last read; `checked` false means never read, which is not judged. */
    smartbill: { checked: boolean; total: number | null; paid: number | null };
    payments: { amount: number; status: PaymentStatus; fiscalStatus: PaymentFiscalStatus | null }[];
}

export interface Divergence {
    reasons: DivergenceReason[];
    /** Money the platform counts as received: succeeded payments. */
    platformPaid: number;
    /** What the platform recorded in SmartBill: the collections it saw come back, whatever happened to them since. */
    recordedPaid: number;
}

export function divergenceOf(input: DivergenceInput): Divergence {
    const platformPaid = sum(input.payments.filter((payment) => payment.status === PaymentStatus.SUCCEEDED));
    const recordedPaid = sum(input.payments.filter((payment) => payment.fiscalStatus === PaymentFiscalStatus.RECORDED));
    const reasons: DivergenceReason[] = [];

    if (!input.smartbill.checked) return { reasons, platformPaid, recordedPaid };
    if (input.smartbill.total === null || input.smartbill.paid === null) {
        return { reasons: ['missing_in_smartbill'], platformPaid, recordedPaid };
    }

    if (bani(input.smartbill.total) !== bani(input.amount)) reasons.push('total_differs');

    // A request in the air, or one whose answer was lost, may already be a collection SmartBill
    // counts and the platform does not: its figure cannot be judged until that is settled — and a
    // lost answer is flagged below, as waiting on a person.
    const unsettled = input.payments.some(
        (payment) => payment.fiscalStatus === PaymentFiscalStatus.UNCERTAIN || payment.fiscalStatus === PaymentFiscalStatus.REVIEW,
    );
    if (!unsettled && bani(input.smartbill.paid) !== bani(recordedPaid)) reasons.push('changed_in_smartbill');

    if (input.payments.some((payment) => payment.fiscalStatus === PaymentFiscalStatus.RECORDED && payment.status !== PaymentStatus.SUCCEEDED)) {
        reasons.push('reversed_still_recorded');
    }
    if (
        input.payments.some(
            (payment) =>
                payment.status === PaymentStatus.SUCCEEDED &&
                (payment.fiscalStatus === PaymentFiscalStatus.FAILED || payment.fiscalStatus === PaymentFiscalStatus.REVIEW),
        )
    ) {
        reasons.push('not_recorded');
    }

    return { reasons, platformPaid, recordedPaid };
}

/** Whether an invoice is due a read: never read, or read longer ago than the period. */
export function dueForCheck(checkedAt: Date | null, now: Date): boolean {
    return checkedAt === null || now.getTime() - checkedAt.getTime() >= DIVERGENCE_CHECK_EVERY_MS;
}

function sum(payments: { amount: number }[]): number {
    return payments.reduce((total, payment) => total + bani(payment.amount), 0) / 100;
}

function bani(lei: number): number {
    return Math.round(lei * 100);
}
