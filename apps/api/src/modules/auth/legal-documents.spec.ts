import { readFileSync } from 'fs';
import { join } from 'path';
import { LEGAL_DOCUMENT_FILES, LEGAL_DOCUMENT_VERSIONS } from './legal-documents';
import { LegalDocument } from 'src/enum/legal-document.enum';

/** `docs/legal/` at the repository root — five levels up from `apps/api/src/modules/auth`. */
const LEGAL_DIR = join(__dirname, '..', '..', '..', '..', '..', 'docs', 'legal');

/** The first bold line of every document: `**Versiunea 0.1 · ciornă din …`. */
const versionPrintedOn = (markdown: string): string | null => /\*\*Versiunea (\d+\.\d+)/.exec(markdown)?.[1] ?? null;

describe('LEGAL_DOCUMENT_VERSIONS', () => {
    it.each(Object.values(LegalDocument))('names the version printed on the %s document', (document) => {
        const markdown = readFileSync(join(LEGAL_DIR, LEGAL_DOCUMENT_FILES[document]), 'utf8');

        expect(versionPrintedOn(markdown)).toBe(LEGAL_DOCUMENT_VERSIONS[document]);
    });
});
