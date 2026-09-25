import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every icon comes from a collection that is installed, so it is bundled and served from our own
 * domain.
 *
 * CLAUDE.md says why: an icon from a collection without its `@iconify-json/*` package is fetched
 * from `api.iconify.design` at run time, and on the classroom's connection that is a blank button —
 * the menu button *is* an icon. The rule was prose until the end-to-end testing of 25 September
 * 2026 found the one exception: "Descarcă" on the invoice PDF page used `i-heroicons-…`, so it drew
 * no icon, logged an error and asked Nuxt's icon proxy for a collection it did not have, on every
 * visit. Nothing else could see it — the page works, the button has its text.
 *
 * The allowed collections are read from `package.json`, so installing a new one is the whole change.
 */

const APP_DIR = new URL("../app", import.meta.url).pathname;
const PACKAGE = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

const INSTALLED = new Set(
  Object.keys({ ...PACKAGE.dependencies, ...PACKAGE.devDependencies })
    .filter((name) => name.startsWith("@iconify-json/"))
    .map((name) => name.slice("@iconify-json/".length))
);

/** An icon name as a whole quoted string: `"i-lucide-download"`, in any quote. */
const ICON = /["'`]i-([a-z0-9]+)-[a-z0-9-]+["'`]/g;

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(vue|ts)$/.test(entry) ? [path] : [];
  });

/** The icons in `source` whose collection is not installed. */
export const unbundledIcons = (source: string, installed: Set<string>): string[] =>
  [...source.matchAll(ICON)]
    .filter(([, collection]) => !installed.has(collection as string))
    .map(([icon]) => icon as string);

describe("icons", () => {
  it("come only from installed collections", () => {
    const offenders = files(APP_DIR).flatMap((path) =>
      unbundledIcons(readFileSync(path, "utf8"), INSTALLED).map(
        (icon) => `${path.slice(APP_DIR.length + 1)}  ${icon}`
      )
    );

    expect(INSTALLED.size).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  // A sweep that matches nothing passes for the wrong reason, so it has to see the one it was
  // written for — and leave alone a URL fragment that happens to contain "i-de-".
  it("would notice one", () => {
    expect(
      unbundledIcons('<UButton icon="i-heroicons-arrow-down-tray">', new Set(["lucide"]))
    ).toEqual(['"i-heroicons-arrow-down-tray"']);
    expect(unbundledIcons('<UButton icon="i-lucide-download">', new Set(["lucide"]))).toEqual([]);
    expect(
      unbundledIcons('<NuxtLink to="/termeni#14-reguli-de-utilizare">', new Set(["lucide"]))
    ).toEqual([]);
  });
});
