import type { AuditChanges, AuditValue } from 'src/entities/audit-log.entity';

/**
 * What counts as a change — E07 S3, the pure half.
 *
 * Kept out of the service so it can be reasoned about and tested without a database, the way the
 * other rules in this codebase are (`arrears.rules.ts`, `absence-notice.rules.ts`).
 */

/**
 * Compares two states over the named fields and returns only what moved.
 *
 * Three decisions worth naming, because each is a way the log could quietly fill with noise or
 * quietly lose a real change:
 *
 * - **Dates compare by their instant, not their identity.** Two `Date` objects for the same moment
 *   are different objects, so `!==` on them reports a change on every save. `dateIssued` would then
 *   appear to move every time anybody touched an invoice.
 * - **Money compares as a number.** A `decimal` column arrives as a string from the driver on one
 *   path and as a number through the transformer on another, so `350` and `"350"` are the same
 *   amount seen twice. Comparing them as written would log a change nobody made.
 * - **`null` and `undefined` are the same absence.** An optional field that was never set and one
 *   explicitly cleared are both "not there", and a diff that distinguishes them reports a change
 *   when a form round-trips without touching the field.
 */
export function diffFields(before: Record<string, unknown>, after: Record<string, unknown>, fields: string[]): AuditChanges {
    const changes: AuditChanges = {};

    for (const field of fields) {
        const from = before[field];
        const to = after[field];
        if (!isSameValue(from, to)) {
            changes[field] = { from: forStorage(from), to: forStorage(to) };
        }
    }

    return changes;
}

/**
 * A whole row shaped like a diff, for the two acts that have only one side.
 *
 * A creation and a deletion are the same picture read in opposite directions, so they share one
 * function: `from: null` everywhere is a row appearing, `to: null` everywhere is a row going away.
 * `action` already says which, and a screen rendering `changes` should not need a second layout for
 * the two ends of a life.
 */
export function snapshotFields(values: Record<string, unknown>, direction: 'created' | 'deleted'): AuditChanges {
    return Object.fromEntries(
        Object.entries(values).map(([field, raw]) => {
            const value = forStorage(raw);
            return [field, direction === 'created' ? { from: null, to: value } : { from: value, to: null }];
        }),
    );
}

function isSameValue(a: unknown, b: unknown): boolean {
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;

    if (a instanceof Date || b instanceof Date) {
        const left = asInstant(a);
        const right = asInstant(b);
        // An unreadable other side is a change, not a match: guessing "same" would hide the one
        // case where a date column came back as something nobody expected.
        return left !== null && right !== null && left === right;
    }

    // Numbers written as text by the driver: compare what they mean, not how they arrived.
    if (isNumeric(a) && isNumeric(b)) return Number(a) === Number(b);

    return a === b;
}

/** A `Date`, or the two shapes a date column arrives as — an ISO string, or epoch milliseconds. */
function asInstant(value: unknown): number | null {
    if (value instanceof Date) return value.getTime();
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    const time = new Date(value).getTime();
    return Number.isNaN(time) ? null : time;
}

function isNumeric(value: unknown): boolean {
    if (typeof value === 'number') return Number.isFinite(value);
    return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value));
}

/**
 * What actually goes into `jsonb`.
 *
 * A `Date` is stored as its ISO string so the entry reads the same whoever opens it, and
 * `undefined` becomes `null` because JSON has no other way to say "was not set" — leaving it
 * `undefined` would drop the key entirely and make a cleared field look untouched.
 *
 * Anything that is not a scalar is stored as its JSON text rather than dropped. Every audited field
 * today is a scalar, so the branch is unreachable in practice; it exists because the alternative —
 * letting an object through — is an entry that reads `[object Object]` for the one value somebody
 * opened the log to see.
 */
function forStorage(value: unknown): AuditValue {
    if (value === undefined || value === null) return null;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
    return JSON.stringify(value) ?? null;
}
