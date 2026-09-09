import { sameAddress } from './same-address';

/**
 * Two callers depend on this agreeing with `lower(profile.email)`: `movesTheAddress` decides
 * whether an edit closes the confirmation gate, and `EmailConfirmationService.confirm` decides
 * whether an outstanding link still proves the address on file. If it were stricter than the
 * lookup, an edit that changed nothing would kill a family's only live link; if it were looser,
 * a link for a genuinely different address would open the gate.
 */
describe('sameAddress', () => {
    it('ignores capitalisation, because the mailbox does', () => {
        expect(sameAddress('Ana@Pop.ro', 'ana@pop.ro')).toBe(true);
    });

    it('ignores surrounding whitespace, which a form leaves behind', () => {
        expect(sameAddress('  ana@pop.ro ', 'ana@pop.ro')).toBe(true);
    });

    it('separates two genuinely different addresses', () => {
        expect(sameAddress('ana@pop.ro', 'ana@pop.com')).toBe(false);
    });

    it('treats a missing address as its own value, not as a match for everything', () => {
        expect(sameAddress(null, 'ana@pop.ro')).toBe(false);
        expect(sameAddress(undefined, 'ana@pop.ro')).toBe(false);
        expect(sameAddress(null, undefined)).toBe(true);
    });
});
