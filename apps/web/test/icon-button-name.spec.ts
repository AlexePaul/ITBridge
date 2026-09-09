import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * An icon-only button has to say what it does.
 *
 * A `<UButton icon="…" />` with no children renders a button whose entire content is an SVG, so a
 * screen reader announces "button" and stops. The accessibility gate catches most of these, and
 * did — but it cannot catch the ones that are not on screen when it looks, and that is exactly
 * where they hide: the three clear buttons on `/admin/profiles` were `v-if`'d on their field having
 * text, so they existed only after somebody typed. The gate loads screens; it does not type.
 *
 * So this is the half the browser cannot do, in the shape the other two source sweeps use. It is
 * deliberately narrow — a self-closing `UButton` with an `icon` and no `aria-label` — because that
 * is the shape that has no other way to get a name. A button with children is left alone: its text
 * is its name.
 */

const APP_DIR = new URL("../app", import.meta.url).pathname;

/** A self-closing `<UButton …/>`, attributes captured, newlines included. */
const SELF_CLOSING_UBUTTON = /<UButton\b((?:[^<>]|\n)*?)\/>/g;

const vueFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return vueFiles(path);
    return entry.endsWith(".vue") ? [path] : [];
  });

/** Icon-only buttons in `source` that carry no accessible name. */
export const namelessIconButtons = (source: string): string[] =>
  [...source.matchAll(SELF_CLOSING_UBUTTON)]
    .map(([, attrs]) => attrs)
    .filter((attrs) => /\bicon\s*=/.test(attrs) || /:icon\s*=/.test(attrs))
    .filter((attrs) => !/aria-label\s*=/.test(attrs))
    .map((attrs) => attrs.replace(/\s+/g, " ").trim().slice(0, 80));

describe("icon-only buttons", () => {
  it("all carry an aria-label", () => {
    const offenders = vueFiles(APP_DIR).flatMap((path) =>
      namelessIconButtons(readFileSync(path, "utf8")).map(
        (attrs) => `${path.slice(APP_DIR.length + 1)}  ${attrs}`
      )
    );

    expect(offenders).toEqual([]);
  });

  // The guard is only worth having if it can see one, and a source sweep is exactly the kind of
  // check that passes because it matches nothing at all.
  it("would notice one", () => {
    const bad = '<UButton v-if="filters.email" variant="link" icon="i-lucide-x" :padded="false" />';
    expect(namelessIconButtons(bad)).toHaveLength(1);

    // And leaves alone the two shapes that already have a name.
    const labelled = '<UButton icon="i-lucide-x" aria-label="Șterge filtrul" />';
    expect(namelessIconButtons(labelled)).toEqual([]);
    const withText = '<UButton icon="i-lucide-plus">Adaugă</UButton>';
    expect(namelessIconButtons(withText)).toEqual([]);
  });
});
