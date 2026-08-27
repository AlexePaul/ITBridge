import { PUBLIC_PAGES } from "#shared/seo";

/**
 * Written by hand rather than by a module: seven pages, one source of truth,
 * no dependency. There is deliberately no <lastmod> — a date that changes on
 * every request is worse than none, and search engines discount it.
 */
export default defineEventHandler((event) => {
  const siteUrl = String(useRuntimeConfig(event).public.siteUrl).replace(/\/$/, "");

  const urls = PUBLIC_PAGES.map(
    (page) =>
      `  <url>\n` +
      `    <loc>${siteUrl}${page.path}</loc>\n` +
      `    <changefreq>monthly</changefreq>\n` +
      `    <priority>${page.priority.toFixed(1)}</priority>\n` +
      `  </url>`
  ).join("\n");

  setHeader(event, "content-type", "application/xml; charset=utf-8");
  setHeader(event, "cache-control", "public, max-age=3600");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
});
