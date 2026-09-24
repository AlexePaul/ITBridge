/**
 * How long the platform keeps what — E22/S3, the pure half.
 *
 * The privacy note promises these numbers in §7, and a promise with no job behind it is, in the
 * words of `docs/legal/README.md`, a maintained lie. They are **proposals** until the school signs
 * them off (`[[PROPUNERE: …]]` in the note), which is why they live here, as constants the office
 * screen is sent, and nowhere else: the day the school decides, one line moves and the note follows.
 *
 * Counted in calendar days on the school's clock, never in milliseconds: "twelve months after the
 * family left" is a date a person can check on a calendar, and a family that left on the 31st of
 * March is due on the 31st of March the year after, whatever the length of the months in between.
 */

/**
 * Months a withdrawn family's data is kept after the day the school recorded the withdrawal.
 *
 * Counted from the withdrawal, never from the last login or the last invoice: E04/S5 is explicit
 * that the platform does not infer "gone" from silence, because the family taking a term off is the
 * one it would erase.
 */
export const FAMILY_RETENTION_MONTHS = 12;

/** Months an enquiry that never became an enrolment is kept after the last time anybody touched it. */
export const LEAD_RETENTION_MONTHS = 12;

/** Months a copy of a message the platform sent is kept after it went out. */
export const MESSAGE_RETENTION_MONTHS = 12;

/**
 * Days an expired e-mail confirmation or password reset is kept after its link stopped working.
 *
 * Not zero: a family clicking a week-old link is told it expired and to ask for a new one, which is
 * a sentence the platform can only say while it still has the row. A month of that is enough.
 */
export const EXPIRED_LINK_RETENTION_DAYS = 30;

/**
 * `'2026-03-31'` moved by `months`, clamped to the end of a shorter month: the 31st of March plus
 * eleven months is the 29th of February in a leap year, the 28th otherwise, and never the 2nd of
 * March — which is where `Date` would put it. Pure string and integer arithmetic, so no time zone
 * or daylight-saving hour can move the answer by a day.
 */
export function addMonthsToDay(day: string, months: number): string {
    const [year, month, date] = day.slice(0, 10).split('-').map(Number);
    const index = year * 12 + (month - 1) + months;
    const targetYear = Math.floor(index / 12);
    const targetMonth = (index % 12) + 1;
    const clamped = Math.min(date, daysInMonth(targetYear, targetMonth));
    return `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`;
}

/** The day a withdrawn family's data is due to go. */
export function erasureDueOn(withdrawnOn: string): string {
    return addMonthsToDay(withdrawnOn, FAMILY_RETENTION_MONTHS);
}

/**
 * The first day whose activity is still kept: anything that happened strictly before it has been
 * kept for `months` and goes. Both ends are school days, compared as text.
 */
export function keptSince(today: string, months: number): string {
    return addMonthsToDay(today, -months);
}

/**
 * Why a family whose term has come is not erased yet. Each one waits on a different person, which
 * is why they are named rather than folded into "not now":
 *
 *  - `enrolment_in_force` and `on_waitlist` — the family is not gone after all: a child is still in
 *    a group or waiting for one. Somebody recorded a withdrawal that is no longer true, and the
 *    office either takes it back or ends what is still open.
 *  - `owes_money` — an invoice is still unpaid. Emptying the row would leave the school a debt it can
 *    no longer ask anybody about; GDPR art. 17(3)(e) keeps what is needed for a legal claim, and the
 *    note says so. The term resumes the day the arrears list stops naming the family.
 */
export type RetentionHold = 'enrolment_in_force' | 'on_waitlist' | 'owes_money';

export function holdOf(family: { enrolmentsInForce: number; openWaitlistEntries: number; outstanding: number }): RetentionHold | null {
    if (family.enrolmentsInForce > 0) return 'enrolment_in_force';
    if (family.openWaitlistEntries > 0) return 'on_waitlist';
    if (family.outstanding > 0) return 'owes_money';
    return null;
}

function daysInMonth(year: number, month: number): number {
    if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
    return [4, 6, 9, 11].includes(month) ? 30 : 31;
}
