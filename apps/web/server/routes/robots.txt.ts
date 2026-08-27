/**
 * Generated rather than static, so the Sitemap line always points at the
 * domain the site is actually served from.
 *
 * The wildcard already allows everything, so naming the AI crawlers changes
 * nothing mechanically — it records a decision. The school wants to be quoted
 * when a parent asks an assistant where their child can learn programming in
 * Bucharest, so the retrieval crawlers are named and allowed. The training-only
 * crawlers are named too, and allowed: blocking them would not protect anything
 * a public brochure site cares about, and some of them feed the corpora that
 * later answer questions about Bucharest schools.
 *
 * /auth is deliberately NOT disallowed. Every public page links to the login
 * form, so a crawler will find it; blocked, it can be listed as a bare URL with
 * no snippet, because the noindex on the page is never fetched. Crawl-allowed
 * plus noindex is the combination that actually keeps a page out.
 */
export default defineEventHandler((event) => {
  const siteUrl = String(useRuntimeConfig(event).public.siteUrl).replace(/\/$/, "");

  // A Vercel preview serves the whole site on a throwaway host. Indexed, it
  // competes with the real domain for its own content.
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv && vercelEnv !== "production") {
    setHeader(event, "content-type", "text/plain; charset=utf-8");
    return "User-agent: *\nDisallow: /\n";
  }

  const body = `User-agent: *
Allow: /
Disallow: /admin/
Disallow: /user/

# Retrieval crawlers — these decide whether the school can be cited in an
# assistant's answer. Blocking any of them costs citations and protects nothing.
User-agent: OAI-SearchBot
User-agent: ChatGPT-User
User-agent: Claude-SearchBot
User-agent: Claude-User
User-agent: PerplexityBot
User-agent: DuckAssistBot
User-agent: Applebot
User-agent: Bingbot
User-agent: meta-webindexer
Allow: /
Disallow: /admin/
Disallow: /user/

# Training crawlers — allowed deliberately.
User-agent: GPTBot
User-agent: ClaudeBot
User-agent: Google-Extended
User-agent: Applebot-Extended
User-agent: meta-externalagent
User-agent: CCBot
Allow: /
Disallow: /admin/
Disallow: /user/

Sitemap: ${siteUrl}/sitemap.xml
`;

  setHeader(event, "content-type", "text/plain; charset=utf-8");
  setHeader(event, "cache-control", "public, max-age=3600");
  return body;
});
