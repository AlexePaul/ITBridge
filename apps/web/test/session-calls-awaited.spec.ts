import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The two calls that establish a session have to finish before anything reads what they set.
 *
 * `useUserStore().fetchUser()` fills `userStore.user`; `initializeProfile()` fills `ProfileSetup`.
 * Both were called without `await` — inside `login`, inside `register`, and again on the login
 * page — so `login()` resolved, `navigateTo("/")` ran its middleware, and both were still empty.
 * What that looks like from a chair: a parent who has not finished step two lands on the dashboard
 * instead of the form and is bounced on their next click, and `admin-check` — which sends a null
 * user back to `/auth/login` — is one render away from doing it to an admin.
 *
 * Neither failure is visible in the source at the call site. Both are one missing word.
 *
 * `.catch(...)`, `.then(...)` and `return` are accepted: each is a caller that has taken hold of
 * the promise on purpose. A bare statement is the one thing that has not.
 */

const APP_DIR = new URL("../app", import.meta.url).pathname;

/** Calls whose result somebody must wait for before reading the state they write. */
const SESSION_CALLS = ["fetchUser", "initializeProfile"];

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return entry.endsWith(".vue") || entry.endsWith(".ts") ? [path] : [];
  });

/** Call sites of a session call that are neither awaited, returned, nor handed to `.then`/`.catch`. */
export const floatingIn = (source: string): string[] => {
  const out: string[] = [];
  for (const name of SESSION_CALLS) {
    const call = new RegExp(`\\b${name}\\s*\\(`, "g");
    for (const match of source.matchAll(call)) {
      const lineStart = source.lastIndexOf("\n", match.index) + 1;
      const before = source.slice(lineStart, match.index);
      // The declaration itself, and every way a caller takes hold of the promise on the way in.
      if (/\b(await|return|const|let|var|function)\b|=>|=/.test(before)) continue;
      // `.then` and `.catch` can be on the following line — `confirm-email.vue` writes it that way
      // — so the window after the call has to be wide enough to see them.
      if (/\.(then|catch)\s*\(/.test(source.slice(match.index, match.index + 120))) continue;
      out.push(name);
    }
  }
  return out;
};

describe("the calls that establish a session", () => {
  it("are awaited everywhere they are made", () => {
    const offenders = sourceFiles(APP_DIR).flatMap((path) =>
      floatingIn(readFileSync(path, "utf8")).map(
        (name) => `${path.slice(APP_DIR.length + 1)}::${name}`
      )
    );

    expect(offenders).toEqual([]);
  });

  // A source sweep is exactly the kind of check that passes because it matches nothing at all, so
  // it is shown a real one first — the line as it actually stood in `useAuthApi.login`.
  it("would notice one", () => {
    expect(floatingIn("    useUserStore().fetchUser();\n")).toEqual(["fetchUser"]);
    expect(floatingIn("    profileInitialization.initializeProfile();\n")).toEqual([
      "initializeProfile",
    ]);

    expect(floatingIn("    await useUserStore().fetchUser();\n")).toEqual([]);
    expect(floatingIn("    return userStore.fetchUser();\n")).toEqual([]);
    expect(floatingIn("      .fetchUser()\n      .catch(() => undefined);\n")).toEqual([]);
    expect(floatingIn("  const initializeProfile = async () => {\n")).toEqual([]);
  });
});
