import { addDays, parseIsoDate, toIsoDate } from '../modules/class-session/class-session.dates';
import { monthIsTaught, teachingMonthRange } from '../modules/invoice/billing-period.rules';

/** How many months the seed invoices. Two, because its enrolments go back about four months. */
export const SEEDED_INVOICE_MONTHS = 2;

/** A month the seed invoices, and the day it says the office issued it. */
export interface SeededInvoiceMonth {
    month: string;
    issuedOn: string;
}

/**
 * The months the seed writes invoices for, newest first: the ones **before** the latest month the
 * school has finished teaching on `seedDay`.
 *
 * Both rules the app enforces are mirrored, so a seeded database is one the app could have produced:
 * a month is issued only once its last teaching week is over (`monthIsTaught`, E15 S9), and it is
 * issued on a day after that — the Wednesday after its last Sunday, a plausible office. Until the
 * preparation for the integral testing of 27 September 2026 the seed invoiced the current month and
 * dated it five days back: the portal showed a September invoice issued on the 22nd, for a month
 * the issuing screen refuses until 5 October.
 *
 * The latest finished month is left out on purpose: it is the one the test plan issues (B5.1, "the
 * most recent finished month not yet issued"). Invoiced by the seed, the whole week of testing had
 * nothing to issue.
 */
export function seededInvoiceMonths(seedDay: string, count = SEEDED_INVOICE_MONTHS): SeededInvoiceMonth[] {
    let month = latestTaughtMonth(seedDay);

    const months: SeededInvoiceMonth[] = [];
    for (let i = 0; i < count; i++) {
        month = previousMonth(month);
        const lastSunday = parseIsoDate(teachingMonthRange(month).to);
        months.push({ month, issuedOn: toIsoDate(addDays(lastSunday, 3)) });
    }
    return months;
}

/**
 * The newest month the school has finished teaching on `day` — the newest the issuing screen would
 * issue. The current month is never taught while it runs (its last week ends on or after its last
 * day), so this walks back one or two steps. `pnpm seed:scale` invoices up to it too.
 */
export function latestTaughtMonth(day: string): string {
    let month = day.slice(0, 7);
    while (!monthIsTaught(month, day)) month = previousMonth(month);
    return month;
}

function previousMonth(month: string): string {
    const [year, mon] = month.split('-').map(Number);
    return mon === 1 ? `${year - 1}-12` : `${year}-${String(mon - 1).padStart(2, '0')}`;
}
