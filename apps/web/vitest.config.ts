import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Testele de aici rulează codul sursă direct, fără să pornească Nuxt. Nuxt injectează la build
 * o serie de simboluri globale — `ref`, `computed`, `useRuntimeConfig`, `$fetch` — pe care sursa
 * le folosește fără import; fișierul din `setupFiles` le pune la loc.
 *
 * Compromisul e conștient: o suită care pornește Nuxt (`@nuxt/test-utils`) ar fi mai fidelă, dar
 * mult mai lentă, iar ce merită testat aici — logica de refresh din `useApi` și store-urile — nu
 * are nevoie de un runtime complet. Componentele, când vor fi testate, o vor cere.
 */
export default defineConfig({
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./app", import.meta.url)),
      "@": fileURLToPath(new URL("./app", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.spec.ts"],
  },
});
