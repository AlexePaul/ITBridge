import { legacyRouteRules } from "./shared/legacy-redirects";
import { PUBLIC_PAGES } from "./shared/seo";

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: {
    enabled: true,

    timeline: {
      enabled: true,
    },
  },
  // `nuxt-auth-utils` was registered but never used — authentication runs
  // through the NestJS backend, not a Nitro session — and without
  // NUXT_SESSION_PASSWORD it logged an error on every SSR render.
  modules: ["@nuxt/ui", "@nuxt/image", "@pinia/nuxt"],
  css: ["~/assets/css/main.css"],
  // The classical system is a light one; the dark palette follows the reader's
  // own system setting rather than a switch in the header.
  colorMode: {
    preference: "system",
    fallback: "light",
  },
  app: {
    // Pages cross over instead of cutting: the outgoing one settles, the
    // incoming one lifts in. `out-in` matters beyond taste — the reveal
    // observer measures the incoming page against the viewport, and an
    // overlapping outgoing page would still be scrolling through it.
    pageTransition: { name: "page", mode: "out-in" },
    head: {
      htmlAttrs: { lang: "ro" },
      link: [
        { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
        { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
        { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
        { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
        { rel: "manifest", href: "/site.webmanifest" },
      ],
      // The palette follows the reader's system setting, so the browser chrome
      // has to as well — a single value paints a pale bar over a dark page.
      // `site.webmanifest` cannot express a media query; its light value still
      // applies to the PWA splash, which is correct.
      meta: [
        { name: "theme-color", content: "#f3f2f2", media: "(prefers-color-scheme: light)" },
        { name: "theme-color", content: "#201f1d", media: "(prefers-color-scheme: dark)" },
      ],
    },
  },

  // Images are served in AVIF/WebP at the size the layout actually asks for, instead of one
  // full-resolution JPEG per slot. The ten photographs came to ~1.1MB brut; the same pictures at
  // equivalent quality are roughly 40% of that, which is E18/S2 and — since it is almost entirely
  // what decides LCP on a phone — E19/S5 as well.
  //
  // No `provider` is set on purpose. Locally that means IPX, which resizes in the Nitro server; on
  // Vercel the module detects the preset and hands the work to Vercel's own optimiser. Pinning one
  // would break the other.
  //
  // `screens` matches the breakpoints `classical.css` is drawn on, so a generated `srcset` offers
  // widths the layout can actually use rather than a generic ladder.
  //
  // The format is chosen per component, not here: `<NuxtPicture format="webp">` emits a `<source>`
  // and keeps the original JPEG as the `<img>` fallback. `<NuxtImg>` renders a single `<img>`, so it
  // could only ever serve one format — either no modern format at all, or no fallback for the
  // browsers that lack it.
  //
  // **WebP only, and AVIF deliberately not**, which is the opposite of what one would assume.
  // Measured on these nine photographs at 620px, the width the layout actually asks for:
  //
  //     original 1056KB · resized JPEG 373KB · AVIF 347KB · WebP 239KB
  //
  // AVIF is barely better than a resized JPEG here, and on one picture it is larger. sharp's AVIF
  // encoder at its default effort is not good at this quality; WebP at 72 is. Since a browser takes
  // the *first* matching `<source>`, listing AVIF first would have served every modern browser the
  // worse of the two. If this is revisited, measure before adding it back.
  image: {
    quality: 72,
    screens: { xs: 380, sm: 520, md: 760, lg: 1024, xl: 1280 },
  },

  // Cormorant Garamond and Lora are self-hosted by @nuxt/fonts (pulled in by
  // @nuxt/ui). Every face carries a `unicode-range`, and @nuxt/fonts skips
  // preload for those by default, so the woff2 was only discovered after the
  // render-blocking stylesheet parsed and the headings swapped a round trip
  // late. `latin-ext` is not optional here: ș and ț live in it.
  fonts: {
    defaults: {
      preload: true,
      subsets: ["latin", "latin-ext"],
      styles: ["normal"],
      weights: [400, 600],
    },
  },
  runtimeConfig: {
    // Server-only. Anything outside `public` stays on the server and is never
    // inlined into the client bundle — which is the whole reason the contact
    // form posts to `/api/contact` instead of calling Resend from the browser.
    resendApiKey: process.env.RESEND_API_KEY,
    // The From address. Its domain has to be verified in Resend, otherwise
    // every send comes back 403.
    contactFrom: process.env.CONTACT_FROM || "IT Bridge School <contact@itbridgeschool.com>",
    public: {
      apiBase: process.env.API_BASE,
      // Canonical URLs, the sitemap and the structured data are all absolute:
      // they need the address the site is actually served from.
      siteUrl: process.env.SITE_URL || "https://itbridgeschool.com",
    },
  },

  // The Romanian slugs are the ones we want indexed; the English ones were
  // never linked from anywhere public, but a permanent redirect costs nothing
  // and keeps any stray link alive.
  routeRules: {
    // Nothing here embeds the site, and the map iframes are embedded *by* it,
    // so denying framing outright costs nothing and closes clickjacking on the
    // login form once the backend goes live.
    "/**": {
      headers: {
        "x-content-type-options": "nosniff",
        "referrer-policy": "strict-origin-when-cross-origin",
        "content-security-policy": "frame-ancestors 'none'",
      },
    },
    // The public pages are rendered once, at build, and served as files from
    // the CDN edge instead of through a serverless function on every request.
    // Nothing on them varies per request — the header's login state is filled
    // in client-side, the contact form posts to a route that stays dynamic —
    // so the HTML is byte-for-byte what SSR produced; what changes is that a
    // crawler gets it in tens of milliseconds instead of waiting on a cold
    // start. Google rations crawling by how fast a host answers, and a new
    // domain is rationed hard: Search Console shows five of these pages as
    // "discovered, currently not indexed", never fetched. This is the lever
    // on that which the repo owns. Derived from PUBLIC_PAGES, so an eighth page
    // is prerendered by being declared, not by being remembered here.
    ...Object.fromEntries(PUBLIC_PAGES.map((page) => [page.path, { prerender: true }])),
    "/courses": { redirect: { to: "/cursuri", statusCode: 301 } },
    "/about": { redirect: { to: "/despre-noi", statusCode: 301 } },
    // The other set of stray links: paths from the WordPress site that used to
    // serve itbridgeschool.ro, which now redirects here and keeps the path.
    ...legacyRouteRules(),
  },

  nitro: {
    prerender: {
      // Only the declared pages, never what they link to. Left on, the crawler
      // would follow the header into /auth/login and the footer into the
      // portal — pages that are noindex and, without the API, error out.
      crawlLinks: false,
    },
  },
});
