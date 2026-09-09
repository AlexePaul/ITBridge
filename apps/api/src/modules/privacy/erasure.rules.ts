/**
 * What an erased family looks like afterwards — E07 S4, the pure half.
 *
 * Kept out of the service so the shape of the shell can be read and tested without a database, the
 * way `arrears.rules.ts` and `absence-notice.rules.ts` are.
 */

/** What the name becomes. Not blank: a row with no name at all reads as one nobody filled in. */
export const ERASED_NAME = { firstName: 'Familie', lastName: 'ștearsă' } as const;

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
        erasedAt: now,
    };
}

/** True once the family has been erased; the screens read this rather than guessing from a blank name. */
export function isErased(profile: { erasedAt: Date | null }): boolean {
    return profile.erasedAt !== null;
}
