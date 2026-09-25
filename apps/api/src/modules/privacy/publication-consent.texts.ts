import { PublicationPurpose } from 'src/enum/publication-purpose.enum';

/**
 * The version of the text a family agrees to, per purpose — E07 S2.
 *
 * The same arrangement as `LEGAL_DOCUMENT_VERSIONS`: the text lives in `docs/legal/`, the public
 * page renders that file, and the backend — whose `dist/` ships without `docs/` — carries a copy of
 * the number. `publication-consent.texts.spec.ts` fails the moment the two disagree. Bump the text,
 * run the tests, bump this.
 *
 * A consent already in force keeps the version it was given under. Whether a new version needs
 * asking again is a judgement about what changed — a typo fixed is not a new purpose — and the
 * person changing the text makes it, rather than a constant making it for them.
 */
export const PUBLICATION_CONSENT_VERSIONS: Record<PublicationPurpose, string> = {
    [PublicationPurpose.PROMOTION]: '0.1',
};

/** The file behind each purpose, relative to `docs/legal/`. */
export const PUBLICATION_CONSENT_FILES: Record<PublicationPurpose, string> = {
    [PublicationPurpose.PROMOTION]: 'acord-lucrari.md',
};

/** Every purpose, in the order the screens list them. */
export const PUBLICATION_PURPOSES: readonly PublicationPurpose[] = [PublicationPurpose.PROMOTION];
