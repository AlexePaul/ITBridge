import termsSource from "../../../docs/legal/termeni-si-conditii.md";
import privacySource from "../../../docs/legal/politica-de-confidentialitate.md";
import cookiesSource from "../../../docs/legal/politica-de-cookies.md";
import worksConsentSource from "../../../docs/legal/acord-lucrari.md";
import type { LegalSlug } from "../shared/legal";

/**
 * The legal documents as they stand in `docs/legal/`, by slug — E22 S2.
 *
 * Imported at build time, so the function on Vercel carries the text with it and the pages need no
 * filesystem; the same files are the single source the README describes. Two routes read them: the
 * page's, and the one that answers for a version by number, which has to know which version is the
 * one in force.
 *
 * **Not in `server/utils/`, and that is load-bearing.** Nitro scans that folder for auto-imports,
 * and a module there that imports Markdown changed how the server was bundled: the public-asset
 * reader stopped having its `import.meta.url` rewritten, resolved one directory too deep, and every
 * `/_nuxt/` script of the built site answered 500 — the pages rendered, then never hydrated. Found
 * by the a11y gate in CI, which waits for hydration; nothing else noticed.
 */
export const LEGAL_SOURCES: Record<LegalSlug, string> = {
  termeni: termsSource,
  confidentialitate: privacySource,
  cookies: cookiesSource,
  "acord-lucrari": worksConsentSource,
};
