import { checkSeedTarget, isLocalHost, LOCAL_PASSWORD } from './seed-target';

/**
 * The guard in front of `TRUNCATE` — E04/S3.
 *
 * Worth its own spec because every case here is one where the seed does something irreversible to a
 * database, and the failure mode of a wrong answer is not a red test somewhere else. The rule is
 * pure, so all of it can be checked without a connection.
 */
describe('checkSeedTarget', () => {
    const local = { host: 'localhost', database: 'itbridge_db' };
    const stage = { host: 'db.stage.example.com', database: 'itbridge_stage' };

    describe('a local database', () => {
        it.each(['localhost', '127.0.0.1', '::1', 'postgres'])('%s needs no permission and no password', (host) => {
            const verdict = checkSeedTarget({ host, database: 'itbridge_db' }, {});
            expect(verdict).toEqual({ ok: true, password: LOCAL_PASSWORD });
        });

        it('still takes SEED_PASSWORD if one is given', () => {
            // No reason to refuse it, and it keeps one command working across both targets.
            expect(checkSeedTarget(local, { SEED_PASSWORD: 'altceva' })).toEqual({ ok: true, password: 'altceva' });
        });
    });

    describe('anything else', () => {
        it('is refused outright when nothing authorises it', () => {
            const verdict = checkSeedTarget(stage, {});
            expect(verdict.ok).toBe(false);
            // The message has to carry what to set, or the next person guesses.
            expect((verdict as { reason: string }).reason).toContain('SEED_ALLOW_NON_LOCAL="itbridge_stage"');
        });

        it('is refused when the grant names a different database', () => {
            // The case the whole design is for: the variable lives in a staging environment file
            // forever, and one day `DB_NAME` points somewhere else. A boolean would have said yes.
            const verdict = checkSeedTarget({ host: stage.host, database: 'itbridge_prod' }, { SEED_ALLOW_NON_LOCAL: 'itbridge_stage', SEED_PASSWORD: 'x' });
            expect(verdict.ok).toBe(false);
            expect((verdict as { reason: string }).reason).toContain('itbridge_prod');
        });

        it('is refused without a password, rather than falling back to the one in this repo', () => {
            const verdict = checkSeedTarget(stage, { SEED_ALLOW_NON_LOCAL: 'itbridge_stage' });
            expect(verdict.ok).toBe(false);
            expect((verdict as { reason: string }).reason).toContain('SEED_PASSWORD');
        });

        it('never hands back the repository password for a remote host', () => {
            // The assertion that matters most: no combination of variables may produce it.
            for (const env of [{}, { SEED_ALLOW_NON_LOCAL: 'itbridge_stage' }, { SEED_ALLOW_NON_LOCAL: '1', SEED_PASSWORD: LOCAL_PASSWORD }]) {
                const verdict = checkSeedTarget(stage, env);
                if (verdict.ok) expect(verdict.password).not.toBe(LOCAL_PASSWORD);
            }
        });

        it('proceeds when the database is named and a password is set', () => {
            expect(checkSeedTarget(stage, { SEED_ALLOW_NON_LOCAL: 'itbridge_stage', SEED_PASSWORD: 'un-secret' })).toEqual({
                ok: true,
                password: 'un-secret',
            });
        });

        it('does not accept the old boolean spelling', () => {
            // `SEED_ALLOW_NON_LOCAL=1` used to mean "yes, anywhere". It now has to name the
            // database, and `1` names nothing — so an old runbook fails loudly instead of seeding
            // whatever it is pointed at.
            const verdict = checkSeedTarget(stage, { SEED_ALLOW_NON_LOCAL: '1', SEED_PASSWORD: 'un-secret' });
            expect(verdict.ok).toBe(false);
        });
    });
});

describe('isLocalHost', () => {
    it('does not mistake a hostname that merely contains one for the real thing', () => {
        // `localhost.stage.example.com` resolves somewhere else entirely; matching on substrings
        // here would authorise it.
        expect(isLocalHost('localhost.stage.example.com')).toBe(false);
        expect(isLocalHost('not-localhost')).toBe(false);
        expect(isLocalHost('localhost')).toBe(true);
    });

    it('treats an unset host as remote', () => {
        // Unset means the connection is described some other way — a URL, a socket — and the seed
        // has not established what it is talking to.
        expect(isLocalHost('')).toBe(false);
    });
});
