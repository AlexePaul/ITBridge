import { changedFieldNames } from './personal-fields';

describe('changedFieldNames', () => {
    it('names only the fields the patch actually moves', () => {
        expect(changedFieldNames({ phone: '+40712345678', address: 'Str. A' }, { phone: '+40799999999', address: 'Str. A' })).toEqual(['phone']);
    });

    // `applyDefined` skips `undefined`, so a form that omits a field has not changed it.
    it('ignores a field that was not sent', () => {
        expect(changedFieldNames({ phone: '+40712345678' }, { phone: undefined })).toEqual([]);
    });

    // Clearing a phone number is exactly the sort of change somebody comes asking about.
    it('counts a field that was cleared', () => {
        expect(changedFieldNames({ phone: '+40712345678' }, { phone: null })).toEqual(['phone']);
        expect(changedFieldNames({ address: 'Str. A' }, { address: '' })).toEqual(['address']);
    });

    it('says nothing when a form round-trips unchanged', () => {
        const before = { firstName: 'Ana', lastName: 'Pop', phone: '+40712345678' };
        expect(changedFieldNames(before, { ...before })).toEqual([]);
    });

    /** A `date` column arrives as text on one path and as a `Date` on another. */
    it('does not invent a change on a birth date re-sent in the other shape', () => {
        expect(changedFieldNames({ birthDate: new Date('2016-04-02T00:00:00.000Z') }, { birthDate: '2016-04-02' })).toEqual([]);
        expect(changedFieldNames({ birthDate: '2016-04-02' }, { birthDate: new Date('2016-04-02T00:00:00.000Z') })).toEqual([]);
    });

    it('sees a birth date that really moves', () => {
        expect(changedFieldNames({ birthDate: '2016-04-02' }, { birthDate: '2016-04-03' })).toEqual(['birthDate']);
    });

    it('returns the names in a stable order, so two identical edits read the same', () => {
        expect(changedFieldNames({ a: 1, b: 1, c: 1 }, { c: 2, a: 2, b: 2 })).toEqual(['a', 'b', 'c']);
    });
});
