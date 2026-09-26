import { Transform } from 'class-transformer';

/**
 * Surrounding spaces off a typed identifier, before it is validated or stored.
 *
 * A phone keyboard adds a space after a word it autocompletes, so "ioana.test " was stored as typed
 * and the family could never sign in as "ioana.test" — and "admin " became a second account next
 * to the office's own (QA of 26 September 2026). Only for identifiers: a password is taken exactly
 * as typed, spaces included.
 */
export const Trim = () => Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));
