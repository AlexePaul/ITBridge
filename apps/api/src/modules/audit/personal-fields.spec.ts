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

    /**
     * These two only mean anything away from Greenwich, which is why `pnpm --filter api test` runs
     * with `TZ=Europe/Bucharest`. In UTC they pass against the bug they exist for: a `date` read
     * back as a `Date` sits at local midnight, and only east of Greenwich does `toISOString()`
     * then report the day before. Setting `process.env.TZ` inside the file does not work — Node
     * has already cached the zone by the time a spec runs.
     */
    describe('a date column, read back two different ways', () => {
        // The case the comparison exists for: TypeORM hands a `date` back as text on one path and
        // as a `Date` at **local midnight** on another, and a form that re-sends it has changed
        // nothing.
        it('does not call an unchanged birth date a change', () => {
            expect(changedFieldNames({ birthDate: new Date(2015, 5, 12) }, { birthDate: '2015-06-12' })).toEqual([]);
        });

        it('and not in the other direction either', () => {
            expect(changedFieldNames({ birthDate: '2015-06-12' }, { birthDate: new Date(2015, 5, 12) })).toEqual([]);
        });

        it('still notices a birth date that really moved', () => {
            expect(changedFieldNames({ birthDate: new Date(2015, 5, 12) }, { birthDate: '2015-06-13' })).toEqual(['birthDate']);
        });
    });
});
