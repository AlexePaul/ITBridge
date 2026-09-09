import { movesTheAddress } from './address-change';

/**
 * The gate closes on the answer this gives, so both wrong answers cost something real: a false
 * positive de-confirms a family who changed their telephone number, a false negative leaves the
 * account vouching for an address nobody has proved.
 */
describe('movesTheAddress', () => {
    it('says yes when the address changes', () => {
        expect(movesTheAddress({ email: 'ana@example.com' }, { email: 'ana.pop@example.com' })).toBe(true);
    });

    it('says no when the field was not sent at all', () => {
        expect(movesTheAddress({ email: 'ana@example.com' }, {})).toBe(false);
    });

    it('says no when the same address is sent back unchanged', () => {
        expect(movesTheAddress({ email: 'ana@example.com' }, { email: 'ana@example.com' })).toBe(false);
    });

    /** `AuthService` looks an address up with `lower(profile.email)`, so this reaches the same row. */
    it('says no to a change of capitalisation or surrounding space', () => {
        expect(movesTheAddress({ email: 'ana@example.com' }, { email: 'Ana@Example.COM' })).toBe(false);
        expect(movesTheAddress({ email: 'ana@example.com' }, { email: '  ana@example.com ' })).toBe(false);
    });

    it('says yes when a family that had no address gains one', () => {
        expect(movesTheAddress({}, { email: 'ana@example.com' })).toBe(true);
        expect(movesTheAddress({ email: null }, { email: 'ana@example.com' })).toBe(true);
    });

    /** Clearing the address proves nothing either, but there is nowhere to send a link. */
    it('says yes when the address is cleared', () => {
        expect(movesTheAddress({ email: 'ana@example.com' }, { email: null })).toBe(true);
    });
});
