import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Toasts are read by parents and teachers, so they are Romanian — CLAUDE.md, **Convenții**.
 *
 * The rule is old; what was missing is anything that checks it. `check-a11y-auth.mjs` has an
 * English detector, but only for the *accessible names* of controls — it was added in E18/S6 after
 * reka-ui's „Show popup" reached 44 screens through one unlabelled `USelectMenu`. It never looks at
 * notification text, so „Goodbye! You have been logged out successfully." sat in `useLogout` from
 * the day it was written, on the one screen every signed-in person eventually reaches.
 *
 * **This is a net, not a proof.** It matches words that cannot be Romanian rather than trying to
 * decide what Romanian is — a gate that fired on Romanian words which happen to look English would
 * be worse than no gate, because the first false positive is the last time anybody reads it. A
 * sentence in English built entirely from words absent below still passes, and that is the accepted
 * cost of never crying wolf.
 */
const APP = fileURLToPath(new URL("../app", import.meta.url));

/** Unmistakably English, and not a word or fragment any Romanian sentence contains. */
const ENGLISH =
  /\b(successfully|Goodbye|You have|Please|Failed to|Could not|Something went wrong|Unable to|Try again|Loading|Saved|Deleted|Updated|Created)\b/i;

/**
 * Every `useNotifications` call with a literal argument — the destructured names and the two
 * aliases screens actually use when `error` would shadow something.
 *
 * `(?<![.\w])` is load-bearing in both directions: without it `console.error("Failed to …")` is a
 * match, and those are **log messages**, which the convention deliberately keeps in English. The
 * first version of this file reported four of them, which is how a gate teaches nobody anything.
 */
const NOTIFICATION =
  /(?<![.\w])(?:success|info|error|warning|notifySuccess|notifyError|notifyInfo)\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)\s*(?:,\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`))?/g;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|vue)$/.test(entry) ? [path] : [];
  });
}

describe("the notifications a family reads", () => {
  const files = sources(APP);

  // A regex that stops matching turns this file into two tests that always pass. 104 calls today,
  // and the floor is deliberately well under that: it exists to catch a broken pattern, not to be
  // re-typed every time somebody adds a screen.
  it("has notifications to check, so an empty sweep cannot pass for a clean one", () => {
    const total = files.reduce(
      (n, file) => n + [...readFileSync(file, "utf8").matchAll(NOTIFICATION)].length,
      0
    );
    expect(total).toBeGreaterThan(80);
  });

  it("are in Romanian, every one of them", () => {
    const english: string[] = [];

    for (const file of files) {
      for (const [, title, body] of readFileSync(file, "utf8").matchAll(NOTIFICATION)) {
        for (const literal of [title, body]) {
          if (literal && ENGLISH.test(literal)) {
            english.push(`${file.slice(APP.length + 1)}: ${literal}`);
          }
        }
      }
    }

    expect(english).toEqual([]);
  });
});
