import { ERASED_NAME, erasedProfileFields, isErased } from './erasure.rules';

describe('erasedProfileFields', () => {
    const now = new Date('2026-09-09T18:00:00.000Z');

    it('leaves nothing that could identify anybody', () => {
        const fields = erasedProfileFields(now);

        expect(fields).toEqual({
            firstName: ERASED_NAME.firstName,
            lastName: ERASED_NAME.lastName,
            email: null,
            phone: null,
            address: null,
            emergencyContactName: null,
            emergencyContactRelation: null,
            emergencyContactPhone: null,
            marketingOptIn: false,
            erasedAt: now,
        });
    });

    /**
     * Both columns are unique. A placeholder would make the second erasure of the day collide with
     * the first, and an invented address cannot be told apart from a real one that bounces.
     */
    it('clears the two unique columns rather than filling them with a placeholder', () => {
        const fields = erasedProfileFields(now);

        expect(fields.email).toBeNull();
        expect(fields.phone).toBeNull();
    });

    // A blank name reads as a family nobody has filled in yet, which is a different thing entirely.
    it('leaves a name that says what happened', () => {
        const fields = erasedProfileFields(now);

        expect(`${String(fields.firstName)} ${String(fields.lastName)}`).toBe('Familie ștearsă');
    });

    it('does not leave a consent ticked that nobody can withdraw any more', () => {
        expect(erasedProfileFields(now).marketingOptIn).toBe(false);
    });
});

describe('isErased', () => {
    it('reads the stamp, not the name', () => {
        expect(isErased({ erasedAt: new Date() })).toBe(true);
        expect(isErased({ erasedAt: null })).toBe(false);
    });
});
