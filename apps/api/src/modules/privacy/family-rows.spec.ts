import { claimsLead, leadsOfFamily, messagesOfFamily, vouchedAddresses } from './family-rows';

/**
 * The address clause: one mailbox whatever its capitals, like `sameAddress` and the unique index on
 * profiles — an exact comparison missed the lead typed `ana@…` for the family registered `Ana@…`.
 */
const mailbox = (email: string) => expect.objectContaining({ type: 'raw', objectLiteralParameters: { mailbox: email } });

describe('vouchedAddresses', () => {
    const typed = { id: 7, email: 'ana@example.com', phone: '+40712345678' };

    it('takes a family the office typed in at both addresses, since only the office can edit that row', () => {
        expect(vouchedAddresses({ ...typed, user: null })).toEqual({ email: 'ana@example.com', phone: '+40712345678' });
    });

    it('takes an account at its e-mail once the family has opened the link sent to it', () => {
        expect(vouchedAddresses({ ...typed, user: { emailConfirmedAt: new Date('2026-03-01T10:00:00Z') } })).toEqual({
            email: 'ana@example.com',
            phone: null,
        });
    });

    it('takes an account at nothing before then, because typing an address proves nothing', () => {
        expect(vouchedAddresses({ ...typed, user: { emailConfirmedAt: null } })).toEqual({ email: null, phone: null });
    });

    /** Nothing in the platform checks a number, so a parent can type in anybody's. */
    it("never takes an account's telephone number", () => {
        expect(vouchedAddresses({ ...typed, user: { emailConfirmedAt: new Date() } }).phone).toBeNull();
    });

    /**
     * `undefined` is a relation nobody loaded, not a family without an account. Read the other way,
     * a caller that forgot the join would hand every typed address the office's trust.
     */
    it('takes nothing when the account was not loaded', () => {
        expect(vouchedAddresses(typed)).toEqual({ email: null, phone: null });
    });
});

describe('leadsOfFamily', () => {
    const confirmed = { id: 7, email: 'ana@example.com', phone: '+40712345678', user: { emailConfirmedAt: new Date() } };

    it('matches the link first, because that is the one that cannot be wrong', () => {
        expect(leadsOfFamily(confirmed)[0]).toEqual({ profile: { id: 7 } });
    });

    it('also matches a vouched address, so a lead an admin typed in is found', () => {
        expect(leadsOfFamily(confirmed)).toEqual([{ profile: { id: 7 } }, { parentEmail: mailbox('ana@example.com') }]);
        expect(leadsOfFamily({ ...confirmed, user: null })).toEqual([
            { profile: { id: 7 } },
            { parentEmail: mailbox('ana@example.com') },
            { parentPhone: '+40712345678' },
        ]);
    });

    it('matches only the link while nothing vouches for the address', () => {
        expect(leadsOfFamily({ ...confirmed, user: { emailConfirmedAt: null } })).toEqual([{ profile: { id: 7 } }]);
    });

    /**
     * The guard that matters: `findOne({ where: { email: undefined } })` drops the condition rather
     * than matching null, so a clause built from a missing address would read as "every lead" — and
     * an erasure would take the whole table with it.
     */
    it('leaves out an address the family does not have', () => {
        expect(leadsOfFamily({ id: 7, email: null, phone: null, user: null })).toEqual([{ profile: { id: 7 } }]);
        expect(leadsOfFamily({ id: 7, email: 'ana@example.com', phone: null, user: null })).toEqual([
            { profile: { id: 7 } },
            { parentEmail: mailbox('ana@example.com') },
        ]);
    });

    it('never returns an empty list, so the caller always has the link to fall back on', () => {
        expect(leadsOfFamily({ id: 7, email: null, phone: null, user: null })).toHaveLength(1);
    });
});

describe('messagesOfFamily', () => {
    it('finds the messages sent to a vouched address', () => {
        expect(messagesOfFamily({ id: 7, email: 'ana@example.com', user: { emailConfirmedAt: new Date() } })).toEqual({ to: mailbox('ana@example.com') });
    });

    /** `{ to: undefined }` would match the whole queue, so there is no clause to run at all. */
    it('has no clause, rather than an empty one, when nothing vouches for the address', () => {
        expect(messagesOfFamily({ id: 7, email: 'office@itbridgeschool.com', user: { emailConfirmedAt: null } })).toBeNull();
        expect(messagesOfFamily({ id: 7, email: null, user: null })).toBeNull();
    });
});

describe('claimsLead', () => {
    const lead = { parentEmail: 'ana@example.com', parentPhone: '+40712345678' };

    it('claims a lead at a vouched address written in other capitals — one mailbox', () => {
        expect(claimsLead({ id: 7, email: 'Ana@Example.com', user: { emailConfirmedAt: new Date() } }, lead)).toBe(true);
    });

    it('claims a lead at a vouched address', () => {
        expect(claimsLead({ id: 7, email: 'ana@example.com', user: { emailConfirmedAt: new Date() } }, lead)).toBe(true);
        expect(claimsLead({ id: 7, phone: '+40712345678', user: null }, lead)).toBe(true);
    });

    it('does not claim one by a number a parent typed, or an address they have not confirmed', () => {
        expect(claimsLead({ id: 7, phone: '+40712345678', user: { emailConfirmedAt: new Date() } }, lead)).toBe(false);
        expect(claimsLead({ id: 7, email: 'ana@example.com', user: { emailConfirmedAt: null } }, lead)).toBe(false);
    });

    it('does not claim a lead with no address by a family with none', () => {
        expect(claimsLead({ id: 7, email: null, phone: null, user: null }, { parentEmail: null, parentPhone: null })).toBe(false);
    });
});
