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
  runtimeConfig: {
    public: {
      apiBase: "http://192.168.0.139:3000",
    },
  },
});
