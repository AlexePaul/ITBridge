/**
 * Which fields of a change are worth naming in the trail — E07 S3, the personal-data half.
 *
 * Pure, so the answer can be reasoned about without a database, and shared so that `ProfileService`
 * and `ChildService` cannot drift apart on what counts as a change.
 */
import { toIsoDate } from 'src/modules/class-session/class-session.dates';

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
    //
    // Through `toIsoDate`, which reads the value's **local** components. `toISOString()` — what
    // this used to do — is the UTC day, and a `date` read back as a `Date` sits at local midnight:
    // in Romania that is 21:00 or 22:00 the day before, so the comparison said "changed" for a
    // birth date nobody had touched. Exactly the case the paragraph above says it exists to stop,
    // and it failed at it everywhere east of Greenwich. The audit log then recorded that somebody
    // edited a child's date of birth, on every save that merely re-sent it.
    if (a instanceof Date && typeof b === 'string') return toIsoDate(a) === toIsoDate(b);
    if (typeof a === 'string' && b instanceof Date) return toIsoDate(a) === toIsoDate(b);
    return a === b;
}
