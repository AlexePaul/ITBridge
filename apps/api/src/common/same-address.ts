/**
 * Whether two spellings name the same mailbox — the one definition of it.
 *
 * `AuthService` looks a family up by `lower(profile.email)`, so a change of capitalisation reaches
 * the same inbox and finds the same row. Anything that compares two addresses has to agree with
 * that, or the two answers drift: one screen would call an edit a move while another called it a
 * typo corrected.
 *
 * It lives here rather than in either caller because both ask the same question about the same
 * thing — `movesTheAddress` decides whether an edit closes the confirmation gate, and
 * `EmailConfirmationService.confirm` decides whether a link still proves the address on file. They
 * are two halves of one rule and must not be able to disagree.
 */
export function sameAddress(one: string | null | undefined, other: string | null | undefined): boolean {
    return normaliseAddress(one) === normaliseAddress(other);
}

/** Trimmed and lower-cased, matching the `lower(profile.email)` the lookups use. */
export function normaliseAddress(email: string | null | undefined): string {
    return (email ?? '').trim().toLowerCase();
}
