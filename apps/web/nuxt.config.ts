// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: "2025-07-15",
  devtools: {
    enabled: true,

    timeline: {
      enabled: true,
    },
  },
  modules: ["@nuxt/ui", "nuxt-auth-utils", "@pinia/nuxt"],
  css: ["~/assets/css/main.css"],
  // The classical system is a light one; the dark palette follows the reader's
  // own system setting rather than a switch in the header.
  colorMode: {
    preference: "system",
    fallback: "light",
  },
  app: {
    head: {
      htmlAttrs: { lang: "ro" },
      link: [
        { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
        { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
        { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
        { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
        { rel: "manifest", href: "/site.webmanifest" },
      ],
      meta: [{ name: "theme-color", content: "#f3f2f2" }],
    },
  },
  runtimeConfig: {
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
    "/courses": { redirect: { to: "/cursuri", statusCode: 301 } },
    "/about": { redirect: { to: "/despre-noi", statusCode: 301 } },
  },
});
