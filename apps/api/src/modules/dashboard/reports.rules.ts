import { FIRST_CHILD_MONTHLY, roundToBani } from 'src/modules/invoice/pricing';

/**
 * The few numbers and calendar rules the reports rest on — E21/S2 and S4.
 *
 * Pure, and next to the services rather than inside them, for the same reason `arrears.rules.ts`
 * exists: a threshold buried in a query is a threshold nobody remembers agreeing to. Each constant
 * here is a decision the owner can read in one line and change in one place.
 */

/** `YYYY-MM`, the shape `Invoice.monthIssued` already has. */
export const BILLING_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export const BILLING_MONTH_MESSAGE = 'must be a billing month in YYYY-MM form';

/**
 * Below this share of seats taken, a group is flagged as under-filled.
 *
 * Sixty per cent of a ten-seat room is six children. The number is a **proposal**, not a decision
 * the owner has signed off: the story asks for "pragul de rentabilitate" and nobody has said what
 * it is. It is exposed on the report so the screen can say which line it is drawing, and it is
 * here so changing it is one edit, not a hunt.
 */
export const OCCUPANCY_THRESHOLD = 0.6;

/**
 * What an empty seat is worth, per month, at list price.
 *
 * `FIRST_CHILD_MONTHLY` — the four-session month a family already knows as 350 lei. An estimate,
 * stated as one: it ignores the sibling rate and discounts, so the real figure is lower, and a
 * seat that stays empty because the age band is wrong was never revenue at all. The report shows
 * the rate next to the sum so nobody mistakes the estimate for a forecast.
 */
export const LOST_REVENUE_PER_SEAT_MONTHLY = FIRST_CHILD_MONTHLY;

/** How many months the finance report covers when the caller does not say. */
export const DEFAULT_FINANCE_MONTHS = 12;

/**
 * `2026-03-14` (or any `Date`) → `2026-03`. The **calendar** month, plainly.
 *
 * This answers "when did the money move", and every caller here is a payment or a report window.
 * It is deliberately **not** the rule that decides which invoice a class belongs to: a week is
 * billed to the month its Monday falls in (`teachingMonthOf`, E15/S9), so a lesson on 3 September
 * can be August work. Money is not taught in a week — it arrives on a day — so the two questions
 * have two answers and two functions. Merging them would move revenue between months in a report
 * nobody would think to re-check.
 */
export function billingMonthOf(value: Date | string): string {
    if (typeof value === 'string') return value.slice(0, 7);
    return `${value.getFullYear()}-${`${value.getMonth() + 1}`.padStart(2, '0')}`;
}

/** The month `n` steps after `month`; negative steps go back. `2026-01` minus one is `2025-12`. */
export function addMonths(month: string, steps: number): string {
    const [year, mon] = month.split('-').map(Number);
    // Month 0 in the constructor is January, so `mon - 1 + steps` lands on the right one and the
    // constructor carries over years both ways.
    const date = new Date(year, mon - 1 + steps, 1);
    return billingMonthOf(date);
}

/** Every month from `from` to `to`, both included. Empty when `to` comes before `from`. */
export function monthsBetween(from: string, to: string): string[] {
    const months: string[] = [];
    let cursor = from;
    while (cursor <= to) {
        months.push(cursor);
        cursor = addMonths(cursor, 1);
    }
    return months;
}

/** The first calendar day of a billing month, as an ISO date. */
export function firstDayOf(month: string): string {
    return `${month}-01`;
}

/** The last calendar day of a billing month, as an ISO date. Knows about February and leap years. */
export function lastDayOf(month: string): string {
    const [year, mon] = month.split('-').map(Number);
    // Day 0 of the next month is the last day of this one — the constructor does the calendar.
    const last = new Date(year, mon, 0).getDate();
    return `${month}-${`${last}`.padStart(2, '0')}`;
}

/** The range the finance report shows when nobody asked for one: the last twelve months, this one included. */
export function defaultFinanceRange(today: Date): { from: string; to: string } {
    const to = billingMonthOf(today);
    return { from: addMonths(to, -(DEFAULT_FINANCE_MONTHS - 1)), to };
}

/** Seats taken over seats available, to two decimals. A group with no seats fills nothing. */
export function fillRate(taken: number, capacity: number): number {
    if (capacity <= 0) return 0;
    return Math.round((taken / capacity) * 100) / 100;
}

/** What the empty seats of a group would bring in a normal month, at list price. */
export function lostRevenueMonthly(free: number): number {
    return roundToBani(Math.max(0, free) * LOST_REVENUE_PER_SEAT_MONTHLY);
}

/** A weekly slot in the timetable — the unit a room is either used or idle in. */
export interface TimetableSlot {
    weekday: number;
    startTime: string;
    endTime: string;
}

/** Whether two slots on the same weekday share any minute. `HH:MM:SS` strings compare as text. */
export function slotsOverlap(a: TimetableSlot, b: TimetableSlot): boolean {
    return a.weekday === b.weekday && a.startTime < b.endTime && b.startTime < a.endTime;
}

/** The distinct slots in a list, in week order then by start. Two groups at the same hour are one slot. */
export function distinctSlots(slots: TimetableSlot[]): TimetableSlot[] {
    const seen = new Map<string, TimetableSlot>();
    for (const slot of slots) {
        seen.set(`${slot.weekday}|${slot.startTime}|${slot.endTime}`, { weekday: slot.weekday, startTime: slot.startTime, endTime: slot.endTime });
    }
    return [...seen.values()].sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime));
}

/**
 * The slots in `schoolSlots` during which nothing happens in a room whose own slots are `roomSlots`.
 *
 * "Dead hours" cannot be read off a clock: the school has no fixed grid, so the only honest
 * definition of an hour in which a room *could* have held a class is an hour in which some other
 * room did. A room idle every Tuesday at 16:00 while the other address teaches then is what this
 * returns; a Sunday morning nobody teaches on is not.
 */
export function deadSlotsOf(roomSlots: TimetableSlot[], schoolSlots: TimetableSlot[]): TimetableSlot[] {
    return distinctSlots(schoolSlots).filter((slot) => !roomSlots.some((used) => slotsOverlap(used, slot)));
}

/**
 * How far back the funnel looks when nobody says — E20/S4.
 *
 * Three months rather than the finance report's twelve, because the two answer different questions.
 * Money is a year-long shape with a September peak; acquisition is what is happening now, and a
 * twelve-month conversion rate hides the month the school stopped ringing people back.
 */
export const DEFAULT_FUNNEL_MONTHS = 3;

export function defaultFunnelRange(today: Date): { from: string; to: string } {
    const to = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const from = new Date(today.getFullYear(), today.getMonth() - DEFAULT_FUNNEL_MONTHS, 1);
    const iso = (date: Date) => `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
    return { from: iso(from), to: iso(to) };
}
