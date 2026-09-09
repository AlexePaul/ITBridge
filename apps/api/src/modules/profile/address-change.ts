/**
 * Whether an edit moves the address the school writes to — E11/S2.
 *
 * Its own file, and a pure function, because the answer decides whether a family's account stops
 * counting as confirmed. That is a rule, not a line inside a save, and it has exactly one shape
 * worth arguing about: a field the caller did not send is not a change, and a field sent unchanged
 * is not one either. Both would otherwise close the gate on a family who touched their telephone
 * number.
 */
export function movesTheAddress(before: { email?: string | null }, patch: { email?: string | null }): boolean {
    if (patch.email === undefined) return false;
    return normalise(patch.email) !== normalise(before.email);
}

/**
 * Compared the way `AuthService` looks an address up — `lower(profile.email)` — so that a change of
 * capitalisation, which reaches the same mailbox and finds the same row, does not read as a move.
 */
function normalise(email: string | null | undefined): string {
    return (email ?? '').trim().toLowerCase();
}
