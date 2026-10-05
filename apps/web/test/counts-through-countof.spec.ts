import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A number and its noun go through `countOf` (or `nounFor`), never through `n === 1 ? "x" : "y"`.
 *
 * The hand-built choice gets two of Romanian's three forms and misses the third: "20 zile" where the
 * language says "20 de zile". The arrears screen said "39 zile întârziere" to the office (QA of 27
 * September 2026), and ten more screens built the same choice by hand — the children list, the
 * issuing button, the referral control, the reports, the agent's "acum 20 zile". CLAUDE.md states
 * the rule; nothing held it, so each new screen wrote the ternary again.
 *
 * What is swept: a ternary on `=== 1` that picks between two quoted words. A choice between two
 * forms of a *verb* ("exista" / "existau") agrees with a number but is not a count, so it is listed
 * with the reason in `NOT_A_COUNT`.
 */
const APP = fileURLToPath(new URL("../app", import.meta.url));

const HAND_BUILT = /===\s*1\s*\?\s*"([^"]+)"\s*:\s*"([^"]+)"/;

/**
 * Choices that agree with a number without counting it — a verb ("n-a" / "n-au" bifat), a phrase
 * with no number beside it, a direction. `countOf` has nothing to say about them.
 */
const NOT_A_COUNT = new Set([
  "n-a|n-au",
  "exista|existau",
  "o familie neanunțată|familii neanunțate",
  "up|down",
]);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|vue)$/.test(entry) ? [path] : [];
  });
}

export function handBuiltCountsIn(source: string): number[] {
  return source.split("\n").flatMap((line, index) => {
    const choice = HAND_BUILT.exec(line);
    if (!choice) return [];
    if (/^\s*(\/\/|\*)/.test(line)) return [];
    if (NOT_A_COUNT.has(`${choice[1]}|${choice[2]}`)) return [];
    return [index + 1];
  });
}

describe("a number and its noun", () => {
  it("go through countOf, which knows when Romanian says „de”", () => {
    const offenders = sources(APP).flatMap((file) =>
      handBuiltCountsIn(readFileSync(file, "utf8")).map(
        (line) => `${file.slice(APP.length + 1)}:${line}`
      )
    );

    expect(offenders).toEqual([]);
  });

  it("would notice one", () => {
    // The line as it stood on the arrears screen.
    expect(
      handBuiltCountsIn('· {{ row.daysOverdue }} {{ row.daysOverdue === 1 ? "zi" : "zile" }}')
    ).toEqual([1]);
    expect(handBuiltCountsIn('return `acum ${days} ${days === 1 ? "zi" : "zile"}`;')).toEqual([1]);
    expect(handBuiltCountsIn('· {{ countOf(row.daysOverdue, "zi", "zile") }}')).toEqual([]);
  });
});
