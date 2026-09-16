import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * Copy before you sort, whenever the array came off something else.
 *
 * `Array.prototype.sort` and `Array.prototype.reverse` reorder **in place**, and a Pinia store hands
 * its state out as `readonly(...)`. So `paymentsStore.payments.sort(...)` does not sort: every swap
 * is a write Vue refuses — eighteen warnings for eighteen rows — and what comes back is the list in
 * the order the API sent it, pretending to be sorted. The payments screen promised "newest first"
 * and never did it, from the day it shipped.
 *
 * This is worth a sweep rather than a comment because of how it fails. There is no exception and no
 * red line anywhere; the array is returned, the template renders it, every row is correct. Only the
 * *order* is wrong, and an order is the one thing a reader cannot check against the screen — which
 * is why it survived review and shipped.
 *
 * `readonly` is not even the whole of it. Sorting an array that belongs to someone else reorders
 * *their* array: a ref two components share, or the one a `v-for` is iterating, which mutates on
 * every render. `/admin/attendance/group/index.vue` and `children/[childId].vue` each carry a
 * comment about paying for that.
 *
 * The rule, and the fix `CLAUDE.md` gives: `[...store.lista].sort(...)`.
 *
 * **Read off an object is the line drawn here.** `store.items.sort()`, `invoices.value.sort()` —
 * anything reached through a dot — has an owner somewhere else and must be copied. A bare local
 * (`rows.sort(...)`, where `rows` was built a few lines up) is the array's only holder and is left
 * alone; `user/absente.vue` does exactly that and is right to. Anything already produced by
 * `filter`, `map`, `slice`, `concat`, `flat`, `flatMap` or a spread is a fresh array and is fine —
 * that is what nearly every sort in this app does.
 */

const APP_DIR = new URL("../app", import.meta.url).pathname;

/** Calls that mutate the array they are made on, rather than returning a new one. */
const REORDERS_IN_PLACE = new Set(["sort", "reverse"]);

/** Calls that hand back an array of their own, so reordering it harms nobody. */
const RETURNS_A_COPY = new Set([
  "filter",
  "map",
  "slice",
  "concat",
  "flat",
  "flatMap",
  "from",
  "toSorted",
  "toReversed",
  "entries",
  "keys",
  "values",
]);

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return entry.endsWith(".vue") || entry.endsWith(".ts") ? [path] : [];
  });

/**
 * The `<script>` blocks of an SFC with the line each one starts on, or the whole file when it
 * already is one.
 *
 * The line matters: an offence is reported so somebody can open it, and a number counted from the
 * top of an extracted block points at the wrong line of the file — off by however much template
 * sits above it, which on these screens is most of them.
 */
const scriptBlocks = (source: string, path: string): { code: string; firstLine: number }[] => {
  if (!path.endsWith(".vue")) return [{ code: source, firstLine: 1 }];
  return [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((match) => ({
    code: match[1]!,
    firstLine: source.slice(0, (match.index ?? 0) + match[0].indexOf(match[1]!)).split("\n").length,
  }));
};

/** Every in-place reorder made on an array this file does not own. */
export const uncopiedReorders = (
  source: string,
  fileName = "sample.ts",
  firstLine = 1
): string[] => {
  const tree = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true);
  const found: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      const receiver = node.expression.expression;

      if (REORDERS_IN_PLACE.has(method)) {
        const fresh =
          // `xs.filter(...).sort(...)` — the copy is right there.
          (ts.isCallExpression(receiver) &&
            ts.isPropertyAccessExpression(receiver.expression) &&
            RETURNS_A_COPY.has(receiver.expression.name.text)) ||
          // `[...xs].sort(...)`, and any other array built on the spot.
          ts.isArrayLiteralExpression(receiver);
        // A bare `rows` is a local the function built; a dotted path belongs to somebody else.
        const borrowed =
          ts.isPropertyAccessExpression(receiver) || ts.isElementAccessExpression(receiver);

        if (!fresh && borrowed) {
          const line = firstLine + tree.getLineAndCharacterOfPosition(node.getStart(tree)).line;
          found.push(
            `${fileName}:${line} — .${method}() reorders ${receiver.getText(tree)} in place; copy it first`
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
};

describe("app sources", () => {
  it("never sorts or reverses an array it read off something else", () => {
    const offences = sourceFiles(APP_DIR).flatMap((path) =>
      scriptBlocks(readFileSync(path, "utf8"), path).flatMap((block) =>
        block.code.trim() === ""
          ? []
          : uncopiedReorders(block.code, path.slice(APP_DIR.length + 1), block.firstLine)
      )
    );

    expect(offences).toEqual([]);
  });

  it("sees the sort that shipped on the payments screen", () => {
    expect(uncopiedReorders(`const rows = paymentsStore.payments.sort(byDate);`)).toEqual([
      "sample.ts:1 — .sort() reorders paymentsStore.payments in place; copy it first",
    ]);
  });

  it("sees a reverse on a ref somebody else holds", () => {
    expect(uncopiedReorders(`const newest = invoices.value.reverse();`)).toEqual([
      "sample.ts:1 — .reverse() reorders invoices.value in place; copy it first",
    ]);
  });

  it("accepts the copy CLAUDE.md prescribes, and every other fresh array", () => {
    expect(uncopiedReorders(`const a = [...store.lista].sort(byDate);`)).toEqual([]);
    expect(uncopiedReorders(`const b = store.lista.filter(Boolean).sort(byDate);`)).toEqual([]);
    expect(uncopiedReorders(`const c = store.lista.slice().sort(byDate);`)).toEqual([]);
    expect(uncopiedReorders(`const d = store.lista.map(toRow).sort(byDate).reverse();`)).toEqual(
      []
    );
  });

  it("leaves a local array alone, because the function that sorts it is its only holder", () => {
    expect(
      uncopiedReorders(`const rows = []; rows.push(x); upcoming.value = rows.sort(byDate);`)
    ).toEqual([]);
  });
});
