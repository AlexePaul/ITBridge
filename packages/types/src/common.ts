/**
 * The contract describes the **wire format**, i.e. the JSON that crosses the network — not the
 * TypeORM entities. The difference matters: a `date` column is a `Date` in the backend and an ISO
 * string after `JSON.stringify`. The aliases below make that distinction visible when reading.
 */

/** ISO calendar date, no time: `2026-03-14`. TypeORM `date` columns. */
export type ISODate = string;

/** Full ISO 8601 instant: `2026-03-14T09:00:00.000Z`. `timestamptz` columns. */
export type ISODateTime = string;

/** Time of day, `HH:MM:SS`. TypeORM `time` columns. */
export type TimeOfDay = string;

/** Billing month, `YYYY-MM`. See `@Unique(['parent', 'monthIssued'])` on `Invoice`. */
export type BillingMonth = string;

/**
 * Turns an entity into the shape a client sees after JSON serialisation: `Date` becomes a string.
 * Used by the contract checks in `apps/api` so that changing a field on an entity cannot silently
 * diverge from the type the frontend consumes.
 */
export type Serialized<T> = T extends Date
    ? string
    : T extends (infer U)[]
      ? Serialized<U>[]
      : T extends object
        ? { [K in keyof T]: Serialized<T[K]> }
        : T;
