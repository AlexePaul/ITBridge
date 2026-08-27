/**
 * ISO-8601 weekday: Monday is 1, Sunday is 7.
 *
 * A real enum rather than `number`, so `weekday: 6` never appears at a call site and a value
 * outside the week cannot be constructed. Kept in step with `apps/api/src/enum/weekday.enum.ts` by
 * the contract checks in `apps/api/src/contract.ts`.
 */
export enum Weekday {
    MONDAY = 1,
    TUESDAY = 2,
    WEDNESDAY = 3,
    THURSDAY = 4,
    FRIDAY = 5,
    SATURDAY = 6,
    SUNDAY = 7,
}

/** In week order, for rendering a timetable. */
export const WEEKDAYS_IN_ORDER: readonly Weekday[] = [
    Weekday.MONDAY,
    Weekday.TUESDAY,
    Weekday.WEDNESDAY,
    Weekday.THURSDAY,
    Weekday.FRIDAY,
    Weekday.SATURDAY,
    Weekday.SUNDAY,
];

/** Romanian names — this is what a parent or a teacher reads. */
export const WEEKDAY_LABELS: Record<Weekday, string> = {
    [Weekday.MONDAY]: 'Luni',
    [Weekday.TUESDAY]: 'Marți',
    [Weekday.WEDNESDAY]: 'Miercuri',
    [Weekday.THURSDAY]: 'Joi',
    [Weekday.FRIDAY]: 'Vineri',
    [Weekday.SATURDAY]: 'Sâmbătă',
    [Weekday.SUNDAY]: 'Duminică',
};
