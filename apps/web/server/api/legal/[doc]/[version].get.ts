import legalArchive from "#legal-archive";
import { isVersionedSlug, PUBLISHED_VERSIONS, type RenderedLegalVersion } from "#shared/legal";
import { renderLegalMarkdown } from "../../../utils/legal-markdown";
import { LEGAL_SOURCES } from "../../../legal-sources";

/**
 * One version of a document by its number — terms §4.7: the version a family accepted „o poți
 * reciti oricând din portal".
 *
 * The version in force is the document itself, so its number answers too, marked as in force: a
 * link written while it was current keeps working. Any other number is served only if it was
 * published, from the archive `legal-versions.spec.ts` keeps complete. The archive is the
 * `#legal-archive` module `nuxt.config.ts` writes at build time, so the function on Vercel carries
 * it the way it carries the documents themselves.
 */
export default defineEventHandler((event): RenderedLegalVersion => {
  const doc = getRouterParam(event, "doc") ?? "";
  const version = getRouterParam(event, "version") ?? "";
  if (!isVersionedSlug(doc) || !/^\d+\.\d+$/.test(version)) {
    throw createError({ statusCode: 404, statusMessage: "No such document" });
  }

  const current = renderLegalMarkdown(LEGAL_SOURCES[doc]);
  if (current.version === version) {
    setHeader(event, "cache-control", "public, max-age=3600");
    return { ...current, inForce: true };
  }

  const published = PUBLISHED_VERSIONS[doc].some((entry) => entry.version === version);
  const kept = published ? legalArchive[`${doc}/${version}`] : undefined;
  if (kept === undefined) {
    throw createError({ statusCode: 404, statusMessage: "No such version" });
  }

  // An archived text never changes — the spec holds it to its fingerprint.
  setHeader(event, "cache-control", "public, max-age=86400");
  return { ...renderLegalMarkdown(kept), inForce: false };
});
