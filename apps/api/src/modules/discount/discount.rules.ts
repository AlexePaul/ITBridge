import { schoolDay } from 'src/common/school-clock';

/**
 * The referral reward, and what "next month" means — E20/S5.
 *
 * E20 decided the referral by hand: half off for the family who brought a new one, and half off for
 * the family who arrived. No code, no link, no automatic attribution — the school types it. What
 * this file adds is the typing: the reward is always the same three values, so an admin looking at
 * a family should be able to grant it with one press instead of filling five fields and getting the
 * month wrong in December.
 */

/** Half off. Both sides of a referral get the same, which is the whole of E20/S5's rule. */
export const REFERRAL_PERCENT = 50;

/**
 * What the discount is called on the list, and the key the second press collides with.
 *
 * The manual form already defaults to this word, so a one-press grant and a hand-typed one are the
 * same row to anybody reading `/admin/reduceri`. That is deliberate: two names for one decision
 * would make the list unreadable long before it made the code cleaner.
 */
export const REFERRAL_DISCOUNT_NAME = 'Recomandare';

/**
 * `'2026-04'` → `'2026-05'`, `'2026-12'` → `'2027-01'`.
 *
 * From the string's own components, never through `Date`: `new Date('2026-12-31')` is midnight
 * **UTC**, so a server west of Greenwich reads the 30th, and a naive `setMonth(+1)` on the 31st
 * lands in the month after next. Both are the off-by-one that CLAUDE.md warns about twice, and
 * neither is visible at review.
 *
 * This is the step the reward is built from: pressing the button again is this function applied
 * once more, which is why it is a rule of its own and not a line inside the service.
 */
export function monthAfter(monthKey: string): string {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) {
        throw new Error(`monthAfter expects a YYYY-MM month, got "${monthKey}"`);
    }

    const year = Number(monthKey.slice(0, 4));
    const month = Number(monthKey.slice(5, 7));
    const rollsOver = month === 12;

    return `${rollsOver ? year + 1 : year}-${String(rollsOver ? 1 : month + 1).padStart(2, '0')}`;
}

/**
 * `'2026-03-09'` → `'2026-04'`.
 *
 * A full day key, not a `YYYY-MM`. The arithmetic would be right either way, which is exactly why
 * the shape is checked: a caller holding `monthIssued` and expecting "the month after that" is
 * confused about which value they are holding, and the answer would be right by accident.
 */
export function nextBillingMonth(dayKey: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) {
        throw new Error(`nextBillingMonth expects a YYYY-MM-DD day, got "${dayKey}"`);
    }

    return monthAfter(dayKey.slice(0, 7));
}

/**
 * The month a reward granted *now* belongs to, on the school's clock.
 *
 * The distinction matters for about two hours a night: at 01:00 on the first of the month in
 * Bucharest it is still the previous day in UTC, so a server asking UTC would write the reward
 * against the month that has just been invoiced.
 */
export function nextBillingMonthAt(now: Date): string {
    return nextBillingMonth(schoolDay(now));
}

/**
 * Where the next press lands: the first month from `from` onwards that the reward does not already
 * cover — E20/S5.
 *
 * Pressing again means **another month**, not more off the same one. Percentages add up against
 * the list price, so a second 50% on one month is a free month; a second 50% on the *next* month is
 * a second reward, which is what a second referral deserves. The run is walked rather than counted
 * so that a gap in the middle — a month somebody removed by hand — gets filled before the run is
 * extended.
 */
export function nextUncoveredMonth(from: string, covered: readonly string[]): string {
    let month = from;
    while (covered.includes(month)) {
        month = monthAfter(month);
    }
    return month;
}

/**
 * What the reward looks like from outside: a family, and the months it covers.
 *
 * Returned by all three of the referral endpoints — read, `+` and `−` — so a screen never has to
 * work out the new state from the old one plus what it just pressed. The month list is the answer
 * to "what happens next", and the server is the only place that knows it.
 */
export interface ReferralReward {
    parentId: number;
    /** `YYYY-MM`, ascending, from next month onwards. Empty when the family has no reward. */
    months: string[];
}
