import { isProfileComplete } from './profile.entity';

/** E11/S2, revised: registration is two required steps, and this is what makes the second one done. */
describe('isProfileComplete', () => {
    const complete = {
        email: 'ana@example.com',
        phone: '+40712345678',
        address: 'Strada Exemplu 1, București',
        emergencyContactName: 'Maria Popescu',
        emergencyContactRelation: 'bunică',
        emergencyContactPhone: '+40723456789',
    };

    it('is true when every field the school needs is filled', () => {
        expect(isProfileComplete(complete)).toBe(true);
    });

    it.each(Object.keys(complete))('is false when %s is missing', (field) => {
        expect(isProfileComplete({ ...complete, [field]: null })).toBe(false);
    });

    it('does not count whitespace as an answer', () => {
        // An untyped input posts `''`, and a space is what somebody types to get past a required
        // field. Neither is a phone number anybody can ring.
        expect(isProfileComplete({ ...complete, phone: '   ' })).toBe(false);
        expect(isProfileComplete({ ...complete, emergencyContactName: '' })).toBe(false);
    });

    it('treats undefined like missing, since the columns are nullable and a select may omit them', () => {
        expect(isProfileComplete({ ...complete, address: undefined })).toBe(false);
    });
});
