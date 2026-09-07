/**
 * The three documents a reader can open — E22 S2 — by the slug in the URL and the file in
 * `docs/legal/` at the repository root. The pages render those files; nothing here is a second
 * copy of the text.
 */
export const LEGAL_DOCUMENTS = {
  termeni: { file: "termeni-si-conditii.md", kicker: "Termeni și condiții" },
  confidentialitate: { file: "politica-de-confidentialitate.md", kicker: "Confidențialitate" },
  cookies: { file: "politica-de-cookies.md", kicker: "Cookie-uri" },
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
