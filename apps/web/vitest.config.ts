import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * These tests run the source directly, without booting Nuxt. Nuxt injects a set of globals at
 * build time — `ref`, `computed`, `useRuntimeConfig`, `$fetch` — that the source uses without
 * importing; the file in `setupFiles` puts them back.
 *
 * The trade-off is deliberate: a suite that boots Nuxt (`@nuxt/test-utils`) would be more faithful
 * but far slower, and what is worth testing here — the refresh logic in `useApi` and the stores —
 * needs no full runtime. Components, once they get tested, will.
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
