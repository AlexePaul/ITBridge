import { readFileSync } from 'fs';
import { join } from 'path';
import { PUBLICATION_CONSENT_FILES, PUBLICATION_CONSENT_VERSIONS, PUBLICATION_PURPOSES } from './publication-consent.texts';
import { PublicationPurpose } from 'src/enum/publication-purpose.enum';

/** `docs/legal/` at the repository root — five levels up from `apps/api/src/modules/privacy`. */
const LEGAL_DIR = join(__dirname, '..', '..', '..', '..', '..', 'docs', 'legal');

/** The first bold line of every document: `**Versiunea 0.1 · ciornă din …`. */
const versionPrintedOn = (markdown: string): string | null => /\*\*Versiunea (\d+\.\d+)/.exec(markdown)?.[1] ?? null;

describe('PUBLICATION_CONSENT_VERSIONS', () => {
    it.each(Object.values(PublicationPurpose))('names the version printed on the text for %s', (purpose) => {
        const markdown = readFileSync(join(LEGAL_DIR, PUBLICATION_CONSENT_FILES[purpose]), 'utf8');

        expect(versionPrintedOn(markdown)).toBe(PUBLICATION_CONSENT_VERSIONS[purpose]);
    });

    it('lists every purpose once, so no screen can leave one out', () => {
        expect([...PUBLICATION_PURPOSES].sort()).toEqual(Object.values(PublicationPurpose).sort());
    });
});
