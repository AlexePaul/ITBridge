import { sameAddress } from 'src/common/same-address';

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
    // `sameAddress`, not a comparison written here: `EmailConfirmationService.confirm` now asks the
    // other half of this question — whether a link still proves the address on file — and the two
    // must not be able to disagree about what „the same mailbox" means.
    return !sameAddress(patch.email, before.email);
}
