import { leadsOfFamily } from './family-rows';

describe('leadsOfFamily', () => {
    const family = { id: 7, email: 'ana@example.com', phone: '+40712345678' };

    it('matches the link first, because that is the one that cannot be wrong', () => {
        expect(leadsOfFamily(family)[0]).toEqual({ profile: { id: 7 } });
    });

    it('also matches the address, so a lead an admin typed in is found', () => {
        expect(leadsOfFamily(family)).toEqual([{ profile: { id: 7 } }, { parentEmail: 'ana@example.com' }, { parentPhone: '+40712345678' }]);
    });

    /**
     * The guard that matters: `findOne({ where: { email: undefined } })` drops the condition rather
     * than matching null, so a clause built from a missing address would read as "every lead" — and
     * an erasure would take the whole table with it.
     */
    it('leaves out an address the family does not have', () => {
        expect(leadsOfFamily({ id: 7, email: null, phone: null })).toEqual([{ profile: { id: 7 } }]);
        expect(leadsOfFamily({ id: 7, email: 'ana@example.com', phone: null })).toEqual([{ profile: { id: 7 } }, { parentEmail: 'ana@example.com' }]);
    });

    it('never returns an empty list, so the caller always has the link to fall back on', () => {
        expect(leadsOfFamily({ id: 7, email: null, phone: null })).toHaveLength(1);
    });
});
