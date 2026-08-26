/**
 * Contractul descrie **formatul de pe sârmă**, adică JSON-ul care traversează rețeaua — nu
 * entitățile TypeORM. Diferența contează: o coloană `date` e `Date` în backend și string ISO
 * după `JSON.stringify`. Aliasurile de mai jos fac distincția vizibilă la citire.
 */

/** Dată calendaristică ISO, fără oră: `2026-03-14`. Coloane TypeORM `date`. */
export type ISODate = string;

/** Moment complet ISO 8601: `2026-03-14T09:00:00.000Z`. Coloane `timestamptz`. */
export type ISODateTime = string;

/** Oră din zi, `HH:MM:SS`. Coloane TypeORM `time`. */
export type TimeOfDay = string;

/** Lună de facturare, `YYYY-MM`. Vezi `@Unique(['parent', 'monthIssued'])` pe `Invoice`. */
export type BillingMonth = string;

/**
 * Transformă o entitate în forma pe care o vede clientul după serializare JSON: `Date` devine
 * string. Folosit de verificările de contract din `apps/api`, ca o schimbare de câmp în entitate
 * să nu poată diverge tăcut de tipul pe care îl consumă frontend-ul.
 */
export type Serialized<T> = T extends Date
    ? string
    : T extends (infer U)[]
      ? Serialized<U>[]
      : T extends object
        ? { [K in keyof T]: Serialized<T[K]> }
        : T;
