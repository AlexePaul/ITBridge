export type { LegalDocumentKey, LegalRecord } from "@itbridge/types";

import type { LegalDocumentKey } from "@itbridge/types";
import type { VersionedSlug } from "#shared/legal";

/**
 * What each document is called on screen, and what accepting it means.
 *
 * Here rather than in `@itbridge/types` for the reason every label in this folder is: the contract
 * describes the wire, and on the wire this is `'terms'`. A runtime value exported from that package
 * has twice arrived in the browser as `undefined`, taking a whole subtree of the page with it.
 *
 * The verbs differ on purpose. The terms are a contract and are *accepted*; the privacy notice is
 * information and is *acknowledged* — nothing in it rests on consent, so there is nothing in it to
 * withdraw. The third is not a document but the clauses inside the terms that Cod civil art. 1203
 * requires to be accepted expressly and separately, which is why it is ticked on its own.
 */
export const LEGAL_DOCUMENT_LABELS = {
  terms: "Termenii și condițiile",
  privacy: "Politica de confidențialitate",
  unusual_clauses: "Clauzele din §14, §15 și §18 ale termenilor",
} as const satisfies Record<LegalDocumentKey, string>;

/** Where a reader goes to read the thing they are being asked to accept. */
export const LEGAL_DOCUMENT_LINKS = {
  terms: "/termeni",
  privacy: "/confidentialitate",
  unusual_clauses: "/termeni#14-reguli-de-utilizare",
} as const satisfies Record<LegalDocumentKey, string>;

/**
 * The page behind each document, for a version by number (`/versiuni/<slug>/<version>`). The
 * clauses are part of the terms, so a version of them is a version of the terms — the ledger even
 * records the same number for both.
 */
export const LEGAL_DOCUMENT_SLUGS = {
  terms: "termeni",
  privacy: "confidentialitate",
  unusual_clauses: "termeni",
} as const satisfies Record<LegalDocumentKey, VersionedSlug>;

/**
 * The order the documents are read in on the profile page — the clauses right after the terms
 * they are part of, not where the ledger happens to put them.
 */
export const LEGAL_READING_ORDER = [
  "terms",
  "unusual_clauses",
  "privacy",
] as const satisfies readonly LegalDocumentKey[];
