import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A screen that can show an error must be able to stop showing it.
 *
 * `AdminError`'s retry calls the screen's `load()` again. If that `load()` never clears
 * `loadError`, the second attempt succeeds, the data arrives, and the template — sitting on
 * `v-else-if="loadError"` — keeps rendering the error card over it. The button works, the request
 * goes out, and nothing on screen changes; the only way back is a page reload, which is the exact
 * thing the retry was added to spare somebody.
 *
 * Five screens shipped like that, and none of them was found by reading: `/admin/children`,
 * `/admin/dashboard`, `/admin/invoices`, `/admin/payments/new` and `/admin/restante`. Driving the
 * button in a browser is what showed it — the retry fired `GET /children`, got a 200, and the error
 * card was still there afterwards.
 *
 * So the rule is about order, not presence: `loadError` has to be cleared **before** the request,
 * not only assigned in the `catch`. `loading` belongs on the same two lines, for the same reason —
 * a retry that shows nothing while it waits looks like a button that did nothing.
 */

const PAGES_DIR = new URL("../app/pages", import.meta.url).pathname;

/** An `async` arrow assigned to a const, with its body — enough to look at what it does first. */
const ASYNC_FN = /const (\w+) = async \([^)]*\) => \{([\s\S]*?)\n\};/g;
const CLEARS = /loadError\.value\s*=\s*(null|"")/;

const vueFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return vueFiles(path);
    return entry.endsWith(".vue") ? [path] : [];
  });

/** Functions that set `loadError` but do not clear it before their `try`. */
export const offendersIn = (source: string): string[] => {
  const out: string[] = [];
  for (const [, name, body] of source.matchAll(ASYNC_FN)) {
    if (!/loadError\.value\s*=/.test(body)) continue;
    const cleared = CLEARS.exec(body);
    const tryAt = body.indexOf("try");
    if (tryAt === -1 || !cleared || cleared.index > tryAt) out.push(name);
  }
  return out;
};

describe("screens that can fail", () => {
  it("clear loadError before retrying, so the retry can succeed visibly", () => {
    const offenders = vueFiles(PAGES_DIR).flatMap((path) =>
      offendersIn(readFileSync(path, "utf8")).map(
        (name) => `${path.slice(PAGES_DIR.length + 1)}::${name}`
      )
    );

    expect(offenders).toEqual([]);
  });

  // The guard is only worth having if it can see one, and a source sweep is exactly the kind of
  // check that passes because it matches nothing at all.
  it("would notice one", () => {
    const broken = [
      "const load = async () => {",
      "  try {",
      "    children.value = await childrenApi.fetchChildren();",
      "  } catch (err: unknown) {",
      '    loadError.value = apiErrorMessage(err, "Nu am putut încărca");',
      "  } finally {",
      "    loading.value = false;",
      "  }",
      "};",
    ].join("\n");
    expect(offendersIn(broken)).toEqual(["load"]);

    const fixed = broken.replace("  try {", "  loadError.value = null;\n  try {");
    expect(offendersIn(fixed)).toEqual([]);
  });
});
