import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * No `console.log` anywhere in `app/`.
 *
 * Not a style rule. The eight that were here printed the things this project is most careful with
 * everywhere else: `console.log("New child created:", newChild)` put a named minor's date of birth
 * and their parent into the browser console, the profile fetch put the family's phone, address and
 * emergency contact there, and the auth plugin logged the whole account object on every page load
 * of the authenticated area. E07 asks that a personal detail not end up in a log, and the console
 * of a shared office computer is a log — one that stays open, scrolls back, and gets screenshotted.
 *
 * `console.error` is deliberately allowed. Those are error handling, not tracing, and on a few
 * screens they are still the only error handling there is; a rule that swept them out would be
 * removing the report of a failure rather than the leak. What they print is an error, and the two
 * that also carry data were the ones removed above.
 *
 * A test rather than a lint rule because `apps/web` has no ESLint — its `lint` script is
 * `prettier --check` — and adding one to make this single point would be a much larger change than
 * the point deserves. If ESLint ever arrives here, `no-console: ["error", { allow: ["error"] }]`
 * says the same thing and this can go.
 */

const APP_DIR = new URL("../app", import.meta.url).pathname;
const CHECKED = /\.(ts|vue)$/;

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return CHECKED.test(entry) ? [path] : [];
  });

describe("app sources", () => {
  it("never calls console.log", () => {
    const offenders = sourceFiles(APP_DIR).flatMap((path) =>
      readFileSync(path, "utf8")
        .split("\n")
        .map((line, index) => ({ line, number: index + 1 }))
        .filter(({ line }) => /(^|[^.\w])console\s*\.\s*log\s*\(/.test(line))
        .map(({ number }) => `${path.slice(APP_DIR.length + 1)}:${number}`)
    );

    expect(offenders).toEqual([]);
  });

  // The guard above is only worth having if it can see one, and a regex over source is exactly the
  // kind of check that passes because it matches nothing at all.
  it("would notice one", () => {
    expect(/(^|[^.\w])console\s*\.\s*log\s*\(/.test('  console.log("child", child);')).toBe(true);
    expect(/(^|[^.\w])console\s*\.\s*log\s*\(/.test("  console.error(err);")).toBe(false);
  });
});
