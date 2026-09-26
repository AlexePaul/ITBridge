import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A screen never shows a caught error's own `message` — `apiErrorMessage` exists for exactly this.
 *
 * `err.message` is not what the API said. When the API answered, what it said is in `err.data`;
 * `err.message` is the layer below, a sentence ofetch builds from the method, the URL and the status:
 *
 *     [POST] "http://127.0.0.1:3130/profiles": 409 Conflict
 *
 * The office's two family forms showed exactly that when a family's email or phone belonged to
 * another one (end-to-end testing, 25 September 2026) — an English line with an internal address in
 * it, on the form used for the most common correction there is. `apiErrorMessage` reads the body,
 * has a Romanian sentence for every code a person can hit, and falls back to the caller's own
 * sentence rather than to this.
 *
 * Screens only: pages, components and layouts are where text reaches a person. A composable that
 * logs `err.message` is logging, which the convention keeps in English on purpose.
 */
const APP = fileURLToPath(new URL("../app", import.meta.url));
const SCREENS = ["pages", "components", "layouts"];

/** `e.message`, `err?.message`, `error.message` — the names a `catch` binds, read for display. */
const RAW_MESSAGE = /\b(?:e|err|error|ex|exception|reason|fetchError)\??\.message\b/;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|vue)$/.test(entry) ? [path] : [];
  });
}

export function rawMessagesIn(source: string): number[] {
  return source.split("\n").flatMap((line, index) => {
    if (!RAW_MESSAGE.test(line)) return [];
    // Logging keeps its English, and a comment explaining this rule is not a breach of it.
    if (/\bconsole\.\w+\(/.test(line) || /^\s*(\/\/|\*)/.test(line)) return [];
    return [index + 1];
  });
}

describe("what a screen shows when a request fails", () => {
  it("is never the error's own message", () => {
    const offenders = SCREENS.flatMap((screen) => sources(join(APP, screen))).flatMap((file) =>
      rawMessagesIn(readFileSync(file, "utf8")).map(
        (line) => `${file.slice(APP.length + 1)}:${line}`
      )
    );

    expect(offenders).toEqual([]);
  });

  it("would notice one", () => {
    // The two lines as they stood in the office's family forms.
    expect(rawMessagesIn('    error(e?.message || "Eroare la crearea profilului");')).toEqual([1]);
    expect(rawMessagesIn("    loadError.value = err.message;")).toEqual([1]);

    expect(rawMessagesIn('    error(apiErrorMessage(e, "Eroare la crearea profilului"));')).toEqual(
      []
    );
    expect(rawMessagesIn('    console.error("Failed:", err.message);')).toEqual([]);
    expect(rawMessagesIn("      errors[field] ??= issue.message;")).toEqual([]);
  });
});
