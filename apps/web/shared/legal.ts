/**
 * The documents a reader can open — E22 S2 — by the slug in the URL and the file in `docs/legal/`
 * at the repository root. The pages render those files; nothing here is a second copy of the text.
 *
 * The fourth is not a document a family accepts at registration: it is the text behind the switch
 * in "Profil" that lets a child's work appear in the school's materials (E07 S2). It is a page all
 * the same, because the family should be able to read what they agreed to without logging in.
 */
export const LEGAL_DOCUMENTS = {
  termeni: { file: "termeni-si-conditii.md", kicker: "Termeni și condiții" },
  confidentialitate: { file: "politica-de-confidentialitate.md", kicker: "Confidențialitate" },
  cookies: { file: "politica-de-cookies.md", kicker: "Cookie-uri" },
  "acord-lucrari": { file: "acord-lucrari.md", kicker: "Lucrările copilului" },
} as const;

export type LegalSlug = keyof typeof LEGAL_DOCUMENTS;

export const isLegalSlug = (value: string): value is LegalSlug => value in LEGAL_DOCUMENTS;

/** What `GET /api/legal/:slug` answers with. */
export interface RenderedLegalDocument {
  /** The document's own H1. */
  title: string;
  /** As printed in the first bold line — `0.1` — or null while a document has none. */
  version: string | null;
  html: string;
}

/** What `GET /api/legal/:slug/:version` answers with: one version, and whether it is the one in force. */
export interface RenderedLegalVersion extends RenderedLegalDocument {
  inForce: boolean;
}

/**
 * The documents whose every published version stays readable — terms §4.7: the version a family
 * accepted „o poți reciti oricând din portal".
 *
 * The terms, with the §14, §15 and §18 clauses inside them, and the privacy notice are accepted at
 * registration, and the ledger keeps the version; every consent to show a child's work keeps the
 * version of its text (E07 S2). The cookie policy is not here: nobody accepts it and nothing
 * records which version somebody read, so the text in force is the only one anybody is owed.
 */
export const VERSIONED_DOCUMENTS = [
  "termeni",
  "confidentialitate",
  "acord-lucrari",
] as const satisfies readonly LegalSlug[];

export type VersionedSlug = (typeof VERSIONED_DOCUMENTS)[number];

export const isVersionedSlug = (value: string): value is VersionedSlug =>
  (VERSIONED_DOCUMENTS as readonly string[]).includes(value);

/** One version put in front of families, and the fingerprint of its text. */
export interface PublishedVersion {
  version: string;
  /**
   * SHA-256 of the text as a reader reads it, in hex — `legalTextFingerprint`. What holds a
   * published text to its number.
   */
  sha256: string;
}

/**
 * Every version of a document that was ever published, oldest first — `docs/legal/README.md`,
 * item 10.
 *
 * **Empty while the texts are drafts.** A version still marked „nepublicată" on its first line, or
 * with a `[[…]]` left in it, was never put in front of a family: the accounts on stage that accepted
 * one are test accounts, and a draft has no business being kept, let alone served on the public
 * site with its placeholders in it.
 *
 * `legal-versions.spec.ts` turns the procedure into a gate, so it cannot be forgotten in the one
 * change where it matters. A text that is no longer a draft can reach families, so its version is
 * listed here with its fingerprint; a listed text does not change under the same number (terms §18
 * — a change is a new version, which families accept again); and a listed version that is no longer
 * the one in the file is archived, verbatim, at `docs/legal/versiuni/<slug>/<version>.md`, where
 * `/versiuni/<slug>/<version>` serves it.
 */
export const PUBLISHED_VERSIONS: Record<VersionedSlug, readonly PublishedVersion[]> = {
  termeni: [],
  confidentialitate: [],
  "acord-lucrari": [],
};

/** A version's own page. */
export const versionPath = (slug: VersionedSlug, version: string): string =>
  `/versiuni/${slug}/${version}`;

/**
 * Where a family goes to re-read a version that is no longer in force, or null when there is
 * nothing to send it to: a draft accepted on stage was never published, so there is no text to keep.
 * Only ever asked about a version the server has said is not in force.
 */
export const supersededTextPath = (
  slug: VersionedSlug,
  version: string,
  published: Record<VersionedSlug, readonly PublishedVersion[]> = PUBLISHED_VERSIONS
): string | null =>
  published[slug].some((entry) => entry.version === version) ? versionPath(slug, version) : null;
