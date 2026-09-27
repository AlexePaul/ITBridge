import { isLegalSlug } from "#shared/legal";
import { renderLegalMarkdown } from "../../utils/legal-markdown";
import { LEGAL_SOURCES } from "../../legal-sources";

/**
 * The legal documents, rendered from `docs/legal/` — E22 S2.
 *
 * The page routes are prerendered, so in practice this answers once per build and then the static
 * HTML does. A version by number is `[doc]/[version].get.ts`.
 */
export default defineEventHandler((event) => {
  const doc = getRouterParam(event, "doc") ?? "";
  if (!isLegalSlug(doc)) {
    throw createError({ statusCode: 404, statusMessage: "No such document" });
  }
  setHeader(event, "cache-control", "public, max-age=3600");
  return renderLegalMarkdown(LEGAL_SOURCES[doc]);
});
