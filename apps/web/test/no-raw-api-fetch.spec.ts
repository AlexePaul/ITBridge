import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every call to the backend goes through `useApi`, so every call gets the refresh on 401.
 *
 * CLAUDE.md has said so for a long time; nothing checked it. `/user/proiecte` called `fetch`
 * directly with the token pasted into a header, and the consequence was invisible until you left
 * the portal open: past the access token's fifteen minutes, every other call on that screen
 * refreshed silently and the archive download alone failed. The page even cited the thumbnails as
 * its precedent — and the thumbnails go through `useApi`.
 *
 * The rule is narrow on purpose. What it forbids is a **network call aimed at the API**: `fetch(`
 * or `$fetch(` whose URL mentions `apiBase`, or which carries an `Authorization` header. Two things
 * are deliberately left alone:
 *
 * - `apps/web/app/composables/api/` — that is where `useApi` lives and where the auth headers are
 *   supposed to be written.
 * - `$fetch` to a same-origin Nitro route (`/api/contact`), which is this app's own server, needs no
 *   bearer token, and has nothing to refresh.
 */

const APP_DIR = new URL("../app", import.meta.url).pathname;
const API_COMPOSABLES = join(APP_DIR, "composables", "api");

/** A `fetch(` or `$fetch(` call and the ~400 characters of arguments after it. */
const CALL = /\$?fetch\s*\(([\s\S]{0,400})/g;

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(vue|ts)$/.test(entry) ? [path] : [];
  });

/** Calls in `source` that reach the API without going through `useApi`. */
export const rawApiCalls = (source: string): string[] => {
  const code = source.replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  return (
    [...code.matchAll(CALL)]
      .map(([, args]) => args)
      // `useApi` builds on `$fetch.create`, which is not a call to the network.
      .filter((args) => !/^\s*\./.test(args))
      .filter((args) => /apiBase|Authorization/.test(args))
      .map((args) => args.replace(/\s+/g, " ").trim().slice(0, 90))
  );
};

describe("calls to the backend", () => {
  it("all go through useApi, so all get the refresh on 401", () => {
    const offenders = files(APP_DIR)
      .filter((path) => !path.startsWith(API_COMPOSABLES))
      .flatMap((path) =>
        rawApiCalls(readFileSync(path, "utf8")).map(
          (call) => `${path.slice(APP_DIR.length + 1)}  ${call}`
        )
      );

    expect(offenders).toEqual([]);
  });

  // A sweep that matches nothing passes for the wrong reason, so show it catching the exact shape
  // this change removed, and leaving the two legitimate ones alone.
  it("would notice one", () => {
    const bad = `const response = await fetch(
      \`\${config.public.apiBase as string}/projects/child/\${child.id}/archive\`,
      { headers: { Authorization: \`Bearer \${tokenStore.accessToken}\` } }
    );`;
    expect(rawApiCalls(bad)).toHaveLength(1);

    // The contact form posts to this app's own Nitro route: same origin, no token, nothing to refresh.
    expect(
      rawApiCalls('await $fetch("/api/contact", { method: "POST", body: result.data });')
    ).toEqual([]);
    // And `$fetch.create` is configuration, not a request.
    expect(
      rawApiCalls("const client = $fetch.create({ baseURL: config.public.apiBase });")
    ).toEqual([]);
  });
});
