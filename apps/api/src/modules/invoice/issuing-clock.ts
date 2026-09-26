/**
 * "Now", for the one question in issuing that turns on the calendar: has the month been taught?
 *
 * A function the integration suites can replace, rather than `new Date()` inline, because they issue
 * October 2026 from registers they wrote themselves — a month that, by the machine's clock, has not
 * happened yet. `createTestApp` moves this clock past every month the suites use; the rule itself
 * is a pure function with its own spec.
 */
let current: () => Date = () => new Date();

export const issuingNow = (): Date => current();

export function setIssuingClock(clock: () => Date): void {
    current = clock;
}
