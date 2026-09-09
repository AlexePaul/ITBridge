import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A colour written as a fixed grey does not have a dark theme.
 *
 * `border-gray-200` and `bg-gray-50` are the light theme's colours spelled out, so they stay light
 * when everything around them turns dark. The borders are merely off-system; `hover:bg-gray-50` is
 * a defect you can watch happen — it paints a near-white background under light text, so hovering a
 * child's row in `/admin/groups/[groupId]/children` made the row unreadable in the dark theme.
 *
 * **The accessibility gate cannot find this**, which is why it is a source sweep. axe measures the
 * colours a page is showing at the moment it looks, and no gate hovers: the failing contrast only
 * exists under the cursor. The gate had passed all three of those screens.
 *
 * The rule is narrow on purpose — a literal `gray` in a colour utility — because that is the shape
 * with no theme behind it. A pair that names both themes (`bg-gray-50 dark:bg-gray-900/30`, as
 * `GroupCard` writes it) is left alone: it is off-token, but it is not a screen that fails to
 * change. The tokens to reach for instead are `border-muted`, `bg-muted` and `text-muted`, which
 * `classical.css` redefines per theme.
 */

const APP_DIR = new URL("../app", import.meta.url).pathname;

/** `border-gray-200`, `hover:bg-gray-50`, `text-gray-700` — any variant prefix, any shade. */
const FIXED_GREY = /(?:[a-z-]+:)*(?:border|bg|text|divide|ring)-gray-\d{2,3}(?:\/\d+)?/g;

const vueFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return vueFiles(path);
    return entry.endsWith(".vue") ? [path] : [];
  });

/**
 * Fixed greys in `source` that no `dark:` counterpart rescues.
 *
 * Comments are stripped first: several files explain in prose why they stopped using these, and a
 * guard that fails on its own documentation is a guard somebody deletes.
 */
export const unthemedGreys = (source: string): string[] => {
  const code = source.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const found = [...code.matchAll(FIXED_GREY)].map(([match]) => match);

  // What a colour and its dark twin have in common: the variants and the property, without the
  // shade. `bg-gray-50` and `dark:bg-gray-900/30` both reduce to `bg`; `hover:bg-gray-50` and
  // `dark:hover:bg-gray-800` both to `hover:bg`. Comparing whole class names would never match,
  // because the whole point of the pair is that the two shades differ.
  const property = (c: string) => c.replace(/^dark:/, "").replace(/-gray-\d{2,3}(?:\/\d+)?$/, "");
  const answered = new Set(found.filter((c) => c.startsWith("dark:")).map(property));

  return found.filter((c) => !c.startsWith("dark:") && !answered.has(property(c)));
};

describe("theme-aware colours", () => {
  it("no screen paints a fixed grey with no dark counterpart", () => {
    const offenders = vueFiles(APP_DIR).flatMap((path) =>
      unthemedGreys(readFileSync(path, "utf8")).map(
        (colour) => `${path.slice(APP_DIR.length + 1)}  ${colour}`
      )
    );

    expect(offenders).toEqual([]);
  });

  // A sweep that matches nothing passes for the wrong reason, so show it catching the two shapes
  // this change removed and leaving the themed pair alone.
  it("would notice one", () => {
    expect(unthemedGreys('<div class="border border-gray-200 rounded-lg" />')).toEqual([
      "border-gray-200",
    ]);
    expect(unthemedGreys('<div class="p-4 hover:bg-gray-50" />')).toEqual(["hover:bg-gray-50"]);

    const themed =
      '<div class="border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900" />';
    expect(unthemedGreys(themed)).toEqual([]);

    // Prose about the old colours is not a use of them.
    expect(unthemedGreys("<!-- was `border-gray-200` on some -->")).toEqual([]);
  });
});
