import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * No two auto-imported files export the same name.
 *
 * Nuxt makes every export of `app/composables/*.ts` and `app/stores/*.ts` available without an
 * import. When two files export one name it keeps one of them and drops the other with a warning in
 * the build log — not an error, and not anything a page can see. `dayLabel` was two functions:
 * the phone register's printed `5.09.2026`, the reschedule screens' `sâmbătă, 5 septembrie`. Every
 * caller imported its own explicitly, so nothing was wrong yet; a caller that relied on the
 * auto-import would have got the other format, with nothing to say so. The warning sat in every
 * deploy log of `release/stage`, where a second one would have scrolled past unread.
 *
 * Types count too: Nuxt lists an exported type in the same `export { … }` of `.nuxt/imports.d.ts`
 * as the functions next to it (`WindowsByDay`, from `useRescheduleWindows`).
 *
 * `app/composables/api/` is left out on purpose: Nuxt scans the top level of a directory only, and
 * those composables are imported by path everywhere.
 */

const APP_DIR = new URL("../app", import.meta.url).pathname;
const AUTO_IMPORTED = ["composables", "stores"];

/** Every name a file exports — values and types — the way the sources here write them. */
const exportedNames = (source: string): string[] => {
  const names: string[] = [];
  const declared =
    /^export\s+(?:declare\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|type|interface|enum)\s+([A-Za-z_$][\w$]*)/gm;
  for (const match of source.matchAll(declared)) names.push(match[1] as string);
  for (const match of source.matchAll(/^export\s+(?:type\s+)?\{([^}]*)\}/gm)) {
    for (const part of (match[1] as string).split(",")) {
      const name = part
        .trim()
        .replace(/^type\s+/, "")
        .split(/\s+as\s+/)
        .pop();
      if (name) names.push(name);
    }
  }
  return names;
};

const autoImportedFiles = (): string[] =>
  AUTO_IMPORTED.flatMap((dir) =>
    readdirSync(join(APP_DIR, dir), { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .map((entry) => `${dir}/${entry.name}`)
  );

describe("auto-imported sources", () => {
  it("export each name from one file only", () => {
    const owners = new Map<string, string[]>();
    for (const file of autoImportedFiles()) {
      for (const name of exportedNames(readFileSync(join(APP_DIR, file), "utf8"))) {
        owners.set(name, [...(owners.get(name) ?? []), file]);
      }
    }
    const duplicated = [...owners]
      .filter(([, files]) => files.length > 1)
      .map(([name, files]) => `${name}: ${files.join(", ")}`);

    expect(duplicated).toEqual([]);
  });

  // A sweep that matches nothing passes just as well as one that finds nothing, so it is shown the
  // shapes the sources here use.
  it("would see a name in each of the shapes it is written in", () => {
    const source = [
      "export function registerDayLabel(day: string): string {",
      "export const dayLabel = (iso: string): string => {",
      "export async function loadAll() {",
      "export interface WindowsByDay {",
      "export type RegisterDay = string;",
      "export { parseDayKey, shiftDay as moveDay };",
      "export type { SessionRegister };",
      "const hidden = 1;",
    ].join("\n");

    expect(exportedNames(source).sort()).toEqual(
      [
        "RegisterDay",
        "SessionRegister",
        "WindowsByDay",
        "dayLabel",
        "loadAll",
        "moveDay",
        "parseDayKey",
        "registerDayLabel",
      ].sort()
    );
  });
});
