import { randomBytes } from 'crypto';
import { ConflictException } from '@nestjs/common';

/**
 * What an erased family looks like afterwards — E07 S4, the pure half.
 *
 * Kept out of the service so the shape of the shell can be read and tested without a database, the
 * way `arrears.rules.ts` and `absence-notice.rules.ts` are. Pure of the database, not of the clock
 * or the random number generator: the erasure stamps a time and rotates a token, and both belong in
 * the description of what the row becomes rather than scattered up the call.
 */

/** What the name becomes. Not blank: a row with no name at all reads as one nobody filled in. */
export const ERASED_NAME = { firstName: 'Familie', lastName: 'ștearsă' } as const;

/**
 * What a kept bank statement line's text becomes — E16/S8. Not blank, for the reason the name is
 * not: an empty line reads as one the bank sent empty. The payer's name goes to `null` instead,
 * because an invented one would read as somebody who paid.
 */
export const ERASED_STATEMENT_TEXT = 'Șters la cererea familiei';

/**
 * The profile as it survives its own erasure.
 *
 * It survives at all because the invoices point at it and `Invoice.parent` is `CASCADE`: deleting
 * the row would take the accounting evidence with it, and E04 S5 is explicit that what the platform
 * keeps is the evidence of what a family paid. So the row stays and everything that could identify
 * anybody leaves it.
 *
 * `email` and `phone` go to `null` rather than to a placeholder. Both columns are unique, so two
 * erased families would collide on any invented value — and a made-up address is indistinguishable
 * from a real one that happens to bounce, which is the same argument E17 S5 makes for leaving the
 * undeliverable row's address empty.
 */
export function erasedProfileFields(now: Date): Record<string, unknown> {
    return {
        firstName: ERASED_NAME.firstName,
        lastName: ERASED_NAME.lastName,
        email: null,
        phone: null,
        address: null,
        emergencyContactName: null,
        emergencyContactRelation: null,
        emergencyContactPhone: null,
        // A consent nobody can any longer give is not a consent that stays ticked.
        marketingOptIn: false,
        // Rotated rather than kept — E17/S4. The token is a credential that travelled in every
        // promotional message the family ever got, and those messages outlive the account: leaving
        // it in place would leave a live link into a row belonging to a family that asked to be
        // gone. Rotated rather than blanked because the column is unique and `NOT NULL`, and two
        // erased families would collide on any shared value — the same argument `email` and `phone`
        // make one line above, reaching the opposite answer because those may be null and this may
        // not. Nothing can be done with the new value: it is written here and read by nobody.
        unsubscribeToken: randomBytes(32).toString('base64url'),
        erasedAt: now,
    };
}

/** True once the family has been erased; the screens read this rather than guessing from a blank name. */
export function isErased(profile: { erasedAt: Date | null }): boolean {
    return profile.erasedAt !== null;
}

/**
 * An erased family's row stays only because its invoices hang off it. Filling it in again would put
 * personal data back on a row that erasure and retention both skip as already done — data nobody
 * could then take out (QA of 26 September 2026: the edit form, a new child and the referral "+"
 * were all accepted on an erased family).
 */
export function assertNotErased(profile: { erasedAt: Date | null }): void {
    if (isErased(profile)) {
        throw new ConflictException({
            message: 'This family was erased; its row keeps only the invoices and cannot be filled in again.',
            error: 'PROFILE_ERASED',
        });
    }
}
