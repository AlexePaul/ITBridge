import termsSource from "../../../../../docs/legal/termeni-si-conditii.md";
import privacySource from "../../../../../docs/legal/politica-de-confidentialitate.md";
import cookiesSource from "../../../../../docs/legal/politica-de-cookies.md";
import { isLegalSlug, type LegalSlug } from "#shared/legal";
import { renderLegalMarkdown } from "../../utils/legal-markdown";

/**
 * The legal documents, rendered from `docs/legal/` — E22 S2.
 *
 * The Markdown is imported at build time, so the function on Vercel carries the text with it and
 * the pages need no filesystem; the same files are the single source the README describes. The
 * three page routes are prerendered, so in practice this answers once per build and then the
 * static HTML does.
 */
const SOURCES: Record<LegalSlug, string> = {
  termeni: termsSource,
  confidentialitate: privacySource,
  cookies: cookiesSource,
};

export default defineEventHandler((event) => {
  const doc = getRouterParam(event, "doc") ?? "";
  if (!isLegalSlug(doc)) {
    throw createError({ statusCode: 404, statusMessage: "No such document" });
  }
  setHeader(event, "cache-control", "public, max-age=3600");
  return renderLegalMarkdown(SOURCES[doc]);
});
