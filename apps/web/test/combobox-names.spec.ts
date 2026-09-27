import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every combobox's trigger is named in Romanian — or it is "Show popup", reka-ui's default.
 *
 * `USelectMenu` puts `$attrs` on the button that opens it, so an `aria-label` names it: that is how
 * the navbar's location switcher stopped saying "Show popup" on 44 screens (E18/S6). `UInputMenu`
 * puts them on its text input instead, and its chevron keeps reka-ui's hardcoded "Show popup" with
 * no prop to change it — which is what the family picker on /admin/reduceri still said (QA of
 * 27 September 2026). The browser gate could not see it: the picker lives in a modal nobody opens
 * there. So `UInputMenu` is not used, and every `USelectMenu` carries its name.
 */

const APP_DIR = new URL("../app", import.meta.url).pathname;

const vueFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return vueFiles(path);
    return entry.endsWith(".vue") ? [path] : [];
  });

/**
 * The opening tag of each use of `component`, attributes included — up to the first `>` outside a
 * quoted value, since a bound attribute may hold one (`(value) => …`, `a > b`).
 */
export const openingTags = (source: string, component: string): string[] =>
  [...source.matchAll(new RegExp(`<${component}\\b`, "g"))].map((match) => {
    const start = match.index ?? 0;
    let quote: string | null = null;
    for (let i = start + match[0].length; i < source.length; i++) {
      const char = source[i];
      if (quote) {
        if (char === quote) quote = null;
      } else if (char === '"' || char === "'") {
        quote = char;
      } else if (char === ">") {
        return source.slice(start, i + 1);
      }
    }
    return source.slice(start);
  });

/** The combobox uses in `source` whose trigger would be announced as "Show popup". */
export const unnamedComboboxes = (source: string): string[] => [
  ...openingTags(source, "UInputMenu"),
  ...openingTags(source, "USelectMenu").filter((tag) => !/\s:?aria-label=/.test(tag)),
];

describe("comboboxes", () => {
  it("name the button that opens them", () => {
    const offenders = vueFiles(APP_DIR).flatMap((path) =>
      unnamedComboboxes(readFileSync(path, "utf8")).map(
        (tag) => `${path.slice(APP_DIR.length + 1)}  ${tag.split("\n")[0]}`
      )
    );

    expect(offenders).toEqual([]);
  });

  // A sweep that matches nothing passes for the wrong reason.
  it("would notice one", () => {
    expect(unnamedComboboxes('<UInputMenu v-model="x" aria-label="Familie" />')).toHaveLength(1);
    expect(unnamedComboboxes('<USelectMenu v-model="x" :items="items" />')).toHaveLength(1);
    expect(
      unnamedComboboxes('<USelectMenu\n  v-model="x"\n  :items="items"\n  aria-label="Familie"\n/>')
    ).toEqual([]);
    expect(unnamedComboboxes('<USelectMenu v-model="x" :aria-label="label" />')).toEqual([]);
    expect(
      unnamedComboboxes('<USelectMenu :filter="(a) => a > 1" aria-label="Familie" />')
    ).toEqual([]);
  });
});
