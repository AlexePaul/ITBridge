import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * `@itbridge/types` describes the wire. What it must not do is *arrive* on it.
 *
 * The package is CommonJS, Vite pre-bundles it, and a runtime value exported from there has
 * reached the browser as `undefined` twice: once an enum whose body the pre-bundler dropped while
 * keeping its export line, once a lookup table. Both times the failure was silent in the worst
 * way — the comparison throws inside a `computed`, Vue abandons the subtree, and a component
 * simply does not render. Green build, green tests, blank screen.
 *
 * The rule has been written in CLAUDE.md since then and was still only prose: `AttendanceType` was
 * an enum in the contract until now, read on the parent's own dashboard, where a dropped subtree is
 * a family told nothing about whether their child came to class.
 *
 * So this is the rule with a test behind it. Anything the contract exports as a value has to be on
 * the list below, with a sentence saying why it is still there — and a new one fails here, by name,
 * rather than on somebody's phone six weeks later.
 *
 * The list is not a target to grow. Where a screen needs something to compare against, the shape to
 * copy is `SessionStatus` in `app/types/class-session.types.ts`: a union of literals in the
 * contract, and an `as const satisfies` object next to the screens that read it.
 */

const CONTRACT_SRC = new URL("../../../packages/types/src", import.meta.url).pathname;

/** `export const X`, `export enum X`, `export function X`, `export class X` — anything with a body. */
const RUNTIME_EXPORT =
  /^export\s+(?:declare\s+)?(const|enum|function|class|let|var)\s+([A-Za-z_$][\w$]*)/gm;

/**
 * What is allowed to survive there, and why. Nothing joins this list without the same sentence.
 *
 * All three predate the rule and all three are consumed by `apps/api` as well, which is what makes
 * moving them a different job from the one that wrote this file: the API would need its own copy,
 * and a second copy of a weekday list is how three of them came to exist once before.
 */
const ALLOWED: Record<string, string> = {
  Weekday:
    "An ISO weekday enum the API imports too (src/enum/weekday.enum.ts mirrors it and contract.ts holds them equal). No web screen reads it as a value.",
  Role: "Two roles, imported as a value across the whole API. No web screen reads it as a value either.",
  WEEKDAY_LABELS:
    "The Romanian day names, read by `apps/api/src/modules/mail/romanian-date.ts` as well as by three admin screens — the one label table with a reader on both sides of the wire.",
  WEEKDAYS_IN_ORDER: "Monday-to-Sunday, alongside WEEKDAY_LABELS and useless apart from it.",
  PROJECT_STATUS_LABELS: "E14 label table, plain object rather than an enum.",
  PROJECT_SOURCE_LABELS: "E14 label table, plain object rather than an enum.",
  UNASSIGNED_FILE_REASON_LABELS: "E14 label table, plain object rather than an enum.",
  SKIPPED_PROJECT_REASON_LABELS: "E14 label table, plain object rather than an enum.",
  UNDELIVERABLE_REASON_LABELS: "E17 label table, plain object rather than an enum.",
};

const exportsOfContract = (): { name: string; kind: string; file: string }[] =>
  readdirSync(CONTRACT_SRC)
    .filter((entry) => entry.endsWith(".ts"))
    .flatMap((entry) => {
      const source = readFileSync(join(CONTRACT_SRC, entry), "utf8");
      return [...source.matchAll(RUNTIME_EXPORT)].map(([, kind, name]) => ({
        name: name as string,
        kind: kind as string,
        file: entry,
      }));
    });

describe("the shared contract", () => {
  it("exports no runtime value that is not on the list, with its reason", () => {
    const unexpected = exportsOfContract()
      .filter(({ name }) => !(name in ALLOWED))
      .map(({ name, kind, file }) => `${file}: export ${kind} ${name}`);

    // If this fails on something you have just added: the contract is the shape of the wire, and a
    // value is not a shape. Put it beside the screens that read it.
    expect(unexpected).toEqual([]);
  });

  it("has let go of every enum it can", () => {
    // An enum is the worst of the two failures: the pre-bundler dropped one's body outright. The
    // two left are the ones the API imports as values, so they cannot simply move.
    const enums = exportsOfContract()
      .filter(({ kind }) => kind === "enum")
      .map(({ name }) => name)
      .sort();

    expect(enums).toEqual(["Role", "Weekday"]);
  });

  it("does not list a reason for something that has since gone", () => {
    // The other direction, so the list cannot quietly become a museum: an entry that no longer
    // matches anything is a sentence nobody will check the next time they read it.
    const present = new Set(exportsOfContract().map(({ name }) => name));
    expect(Object.keys(ALLOWED).filter((name) => !present.has(name))).toEqual([]);
  });
});
