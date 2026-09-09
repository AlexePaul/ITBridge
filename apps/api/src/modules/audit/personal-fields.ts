/**
 * Which fields of a change are worth naming in the trail — E07 S3, the personal-data half.
 *
 * Pure, so the answer can be reasoned about without a database, and shared so that `ProfileService`
 * and `ChildService` cannot drift apart on what counts as a change.
 */

/**
 * The names of the fields the update actually moves.
 *
 * Compares against the row as it stands, so a form that round-trips every field and changes one
 * reports one — the same discipline `diffFields` applies to money, minus the values. `undefined`
 * means "not sent" and is skipped, which is what `applyDefined` does with it; `null` and `''` are
 * values, and clearing a phone number is exactly the kind of change somebody would come asking
 * about.
 */
export function changedFieldNames(before: Record<string, unknown>, patch: Record<string, unknown>): string[] {
    return Object.keys(patch)
        .filter((field) => patch[field] !== undefined)
        .filter((field) => !sameValue(before[field], patch[field]))
        .sort();
}

function sameValue(a: unknown, b: unknown): boolean {
    if (a == null && b == null) return true;
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    // A `date` column comes back as text on one path and as a `Date` on another, so a birth date
    // re-sent unchanged would otherwise read as a change every time.
    if (a instanceof Date && typeof b === 'string') return a.toISOString().slice(0, 10) === b.slice(0, 10);
    if (typeof a === 'string' && b instanceof Date) return a.slice(0, 10) === b.toISOString().slice(0, 10);
    return a === b;
}
