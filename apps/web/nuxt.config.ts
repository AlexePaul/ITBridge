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
  modules: ["@nuxt/ui", "@pinia/nuxt"],
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
    "/courses": { redirect: { to: "/cursuri", statusCode: 301 } },
    "/about": { redirect: { to: "/despre-noi", statusCode: 301 } },
  },
});
