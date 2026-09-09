import { diffFields, snapshotFields } from './audit.rules';

describe('diffFields', () => {
    it('reports only the fields that moved', () => {
        const changes = diffFields({ amount: 350, method: 'cash', reference: 'A-1' }, { amount: 150, method: 'cash', reference: 'A-1' }, [
            'amount',
            'method',
            'reference',
        ]);

        expect(changes).toEqual({ amount: { from: 350, to: 150 } });
    });

    it('writes nothing when nothing moved', () => {
        expect(diffFields({ amount: 350 }, { amount: 350 }, ['amount'])).toEqual({});
    });

    it('ignores fields it was not asked about', () => {
        const changes = diffFields({ a: 1, b: 1 }, { a: 2, b: 2 }, ['a']);
        expect(changes).toEqual({ a: { from: 1, to: 2 } });
    });

    // The three ways a naive comparison fills the log with changes nobody made.
    describe('does not invent a change', () => {
        it('for two Date objects holding the same instant', () => {
            const iso = '2026-09-09T10:00:00.000Z';
            expect(diffFields({ at: new Date(iso) }, { at: new Date(iso) }, ['at'])).toEqual({});
        });

        it('for a decimal that arrived as a string on one side and a number on the other', () => {
            expect(diffFields({ amount: '350' }, { amount: 350 }, ['amount'])).toEqual({});
            expect(diffFields({ amount: '350.00' }, { amount: 350 }, ['amount'])).toEqual({});
        });

        /**
         * A `date` column comes back from the driver as `'2026-03-01'` while the DTO path assigns a
         * `Date`, so an edit that re-sent the same day would otherwise log a move every time.
         */
        it('for a date column read back as text and reassigned as a Date', () => {
            expect(diffFields({ dateIssued: '2026-03-01' }, { dateIssued: new Date('2026-03-01') }, ['dateIssued'])).toEqual({});
        });

        it('for a field that is absent on one side and null on the other', () => {
            expect(diffFields({ note: undefined }, { note: null }, ['note'])).toEqual({});
        });
    });

    describe('still sees a real change', () => {
        it('when a date actually moves', () => {
            const changes = diffFields({ at: new Date('2026-09-09T10:00:00.000Z') }, { at: new Date('2026-09-10T10:00:00.000Z') }, ['at']);
            expect(changes.at).toEqual({
                from: '2026-09-09T10:00:00.000Z',
                to: '2026-09-10T10:00:00.000Z',
            });
        });

        it('when a date column really moves, whichever shape each side arrived in', () => {
            expect(diffFields({ dateIssued: '2026-03-01' }, { dateIssued: new Date('2026-03-02') }, ['dateIssued'])).toEqual({
                dateIssued: { from: '2026-03-01', to: '2026-03-02T00:00:00.000Z' },
            });
        });

        it('when an amount changes but only as text', () => {
            expect(diffFields({ amount: '350' }, { amount: '150' }, ['amount'])).toEqual({
                amount: { from: '350', to: '150' },
            });
        });

        it('when a field is cleared', () => {
            expect(diffFields({ note: 'de la birou' }, { note: null }, ['note'])).toEqual({
                note: { from: 'de la birou', to: null },
            });
        });

        it('when a field is filled in for the first time', () => {
            expect(diffFields({ note: null }, { note: 'corectat' }, ['note'])).toEqual({
                note: { from: null, to: 'corectat' },
            });
        });

        // `0` and `''` are values, not absences — a diff that treats them as missing would lose the
        // most interesting change on a money screen.
        it('when an amount drops to zero', () => {
            expect(diffFields({ amount: 350 }, { amount: 0 }, ['amount'])).toEqual({
                amount: { from: 350, to: 0 },
            });
        });
    });

    it('stores dates as ISO strings, so an entry reads the same to everybody', () => {
        const changes = diffFields({ at: null }, { at: new Date('2026-01-02T03:04:05.000Z') }, ['at']);
        expect(changes.at?.to).toBe('2026-01-02T03:04:05.000Z');
    });
});

describe('snapshotFields', () => {
    const row = { amount: 350, method: 'cash', date: new Date('2026-03-10T00:00:00.000Z'), notes: null };

    it('reads a creation as every field arriving from nothing', () => {
        expect(snapshotFields(row, 'created')).toEqual({
            amount: { from: null, to: 350 },
            method: { from: null, to: 'cash' },
            date: { from: null, to: '2026-03-10T00:00:00.000Z' },
            notes: { from: null, to: null },
        });
    });

    it('reads a deletion as the same picture the other way round', () => {
        expect(snapshotFields(row, 'deleted')).toEqual({
            amount: { from: 350, to: null },
            method: { from: 'cash', to: null },
            date: { from: '2026-03-10T00:00:00.000Z', to: null },
            notes: { from: null, to: null },
        });
    });

    // The trail is read long after the row is gone, so a value that cannot be rendered is worse
    // than one that is merely verbose.
    it('keeps a non-scalar readable instead of storing [object Object]', () => {
        expect(snapshotFields({ meta: { a: 1 } }, 'created').meta).toEqual({ from: null, to: '{"a":1}' });
    });
});
