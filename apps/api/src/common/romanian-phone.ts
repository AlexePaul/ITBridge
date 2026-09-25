import { Transform } from 'class-transformer';

/**
 * A Romanian telephone number as people type it, in the one spelling the platform stores: `+40…`.
 *
 * `@IsPhoneNumber('RO')` accepts `0712345678`, `0712 345 678` and `+40712345678` alike, and nothing
 * turned them into one form on the way in — the portal's setup form did, in the browser, and the
 * office's family forms did not. So the duplicate check on `profiles.phone`, which compares strings,
 * let a second family hold a number the first already had, in a different spelling; and the export
 * and the erasure, which find a lead typed from a phone call by its number, missed the ones typed
 * the other way. The rule belongs to the API, like `@EmptyToUndefined()`: a decision about what a
 * value means is not left to every caller that has to remember it.
 *
 * The shape is the web's `normalizePhone`, kept identical on purpose. Anything that is not a phone
 * number comes out close to how it went in, so the validator after it still refuses it by name.
 */
export function normalizeRomanianPhone(raw: string): string {
    const compact = raw.replace(/[\s.\-()]/g, '');
    if (compact.startsWith('+')) return compact;
    if (compact.startsWith('00')) return `+${compact.slice(2)}`;
    if (compact.startsWith('0')) return `+40${compact.slice(1)}`;
    return compact;
}

/** Normalises a telephone field before validation. Below `@EmptyToUndefined()`, which runs first. */
export function NormalizePhone(): PropertyDecorator {
    return Transform(({ value }: { value: unknown }) => (typeof value === 'string' && value.trim() !== '' ? normalizeRomanianPhone(value) : value));
}
