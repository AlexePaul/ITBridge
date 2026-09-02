import { CONTENT_UPDATED_ISO, PUBLIC_PAGES } from "#shared/seo";

/**
 * Written by hand rather than by a module: seven pages, one source of truth,
 * no dependency.
 *
 * <lastmod> is CONTENT_UPDATED_ISO — the hand-maintained day the facts were
 * last checked — not the build time and not the request time. A date that moves
 * on its own is one a search engine learns to discount; one that moves only
 * when a page actually changed is what it reads to decide which URLs to fetch
 * first. That decision is the whole problem on a new domain: Search Console
 * lists five of these seven pages as "discovered, currently not indexed", with
 * no crawl date at all, and a sitemap that cannot say "this changed last week"
 * gives the scheduler no reason to move them up.
 *
 * There is no <changefreq>: Google ignores it, and "monthly" next to a lastmod
 * from a few days ago would read as a contradiction anyway.
 */
export default defineEventHandler((event) => {
  const siteUrl = String(useRuntimeConfig(event).public.siteUrl).replace(/\/$/, "");

  const urls = PUBLIC_PAGES.map(
    (page) =>
      `  <url>\n` +
      `    <loc>${siteUrl}${page.path}</loc>\n` +
      `    <lastmod>${CONTENT_UPDATED_ISO}</lastmod>\n` +
      `    <priority>${page.priority.toFixed(1)}</priority>\n` +
      `  </url>`
  ).join("\n");

  setHeader(event, "content-type", "application/xml; charset=utf-8");
  setHeader(event, "cache-control", "public, max-age=3600");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
});
