import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * The seed is the only other door that creates accounts, and it does not go through `register`.
 *
 * E22 S4 added a gate: a parent with a document outstanding is sent to `/user/termeni-noi` from
 * every portal page. What decides "outstanding" is the absence of a row in `document_acceptances`,
 * so an account created without those rows has *all three* documents outstanding — and the whole
 * parent portal collapses to one screen, for every seeded family at once.
 *
 * That is not a hypothetical: it is what the seed did until this story wrote the rows, and it would
 * have shipped to stage looking like a catastrophic bug in the portal rather than a missing insert
 * in a fixture. Nothing else catches it — `check-a11y-auth.mjs` signs in as the admin, who is
 * exempt by design, so the run would report all 52 screens clean while every parent saw one.
 *
 * A source sweep rather than a database test, because the seed needs a database and this needs to
 * fail on the pull request that deletes the block, not on the afternoon somebody opens the portal.
 */
const SEED = readFileSync(join(__dirname, 'seed.ts'), 'utf8');

describe('the seed', () => {
    it('writes the document acceptances every parent account needs', () => {
        expect(SEED).toContain('DocumentAcceptance');
        expect(SEED).toContain('ACCEPTED_AT_REGISTRATION');
    });

    it('leaves one family on an older version, so the re-acceptance screen is a state somebody meets', () => {
        // Without it the screen exists only for whoever edits rows by hand, which is the same as
        // saying it is never looked at — and it is the one screen a family is *forced* through.
        expect(SEED).toMatch(/staleFamily/);
    });
});
