import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Turbo runs in `strict` mode, so a task sees only what `globalEnv` declares.
 *
 * Everything else is missing with no message at all: the shell accepts the assignment, turbo drops
 * it, and the script reads `undefined` and falls back to its default. CLAUDE.md already calls this
 * the likeliest cause when something "cannot see" a variable that is plainly in `.env` — it was
 * simply nothing's job to notice.
 *
 * Two were undeclared when this was written, and both were the same small story.
 * `check-third-party.mjs` and `check-a11y-auth.mjs` both served their build on **3124**, so the two
 * commands could not be run together; the way out was `THIRD_PARTY_PORT`, and `pnpm test:privacy`
 * goes through turbo, so the override never reached the script. A knob that does nothing is worse
 * than no knob — it sends whoever turns it looking somewhere else.
 */

const ROOTS = [
  "../../../apps/api/src",
  "../../../apps/api/test",
  "../../../apps/api/scripts",
  "../../../apps/web/app",
  "../../../apps/web/server",
  "../../../apps/web/scripts",
  "../../../apps/web/shared",
  "../../../apps/agent/src",
  "../../../packages",
];

const TURBO_JSON = new URL("../../../turbo.json", import.meta.url).pathname;
const SOURCE = /\.(ts|mjs|vue)$/;
const READ = /process\.env\.([A-Z_0-9]+)/g;

/**
 * Variables that are deliberately not declared, and why.
 *
 * Both are read by something that does **not** run through turbo, which is the only honest reason
 * for a name to be missing from `globalEnv`.
 */
const OUTSIDE_TURBO: Record<string, string> = {
  SEED_TODAY:
    "`pnpm seed` calls the workspace script directly rather than through `turbo run`, so the seed's day is not turbo's to pass on. Written down in CLAUDE.md as well.",
  TZ: "Set by the jest scripts themselves, in `apps/api/package.json`, because the zone has to be fixed before Node starts — inheriting it is exactly what must not happen.",
};

const sourceFiles = (dir: string): string[] => {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) return [];
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return SOURCE.test(entry) ? [path] : [];
  });
};

/** `globalEnv`, parsed out of a JSON file that carries comments. */
const declared = (): string[] => {
  const withoutComments = readFileSync(TURBO_JSON, "utf8").replace(/^\s*\/\/.*$/gm, "");
  return (JSON.parse(withoutComments) as { globalEnv: string[] }).globalEnv;
};

const matches = (name: string, pattern: string): boolean =>
  pattern.endsWith("*") ? name.startsWith(pattern.slice(0, -1)) : name === pattern;

describe("every environment variable a task reads", () => {
  it("is declared in turbo.json, or has a reason not to be", () => {
    const patterns = declared();
    const roots = ROOTS.map((root) => new URL(root, import.meta.url).pathname);
    const files = [
      ...roots.flatMap(sourceFiles),
      new URL("../nuxt.config.ts", import.meta.url).pathname,
    ];

    const read = new Set<string>();
    for (const file of files) {
      for (const [, name] of readFileSync(file, "utf8").matchAll(READ)) read.add(name as string);
    }

    // A name here is either missing from `globalEnv` — add it — or genuinely read outside turbo,
    // in which case it goes in `OUTSIDE_TURBO` with the sentence that says where.
    const undeclared = [...read]
      .filter(
        (name) => !(name in OUTSIDE_TURBO) && !patterns.some((pattern) => matches(name, pattern))
      )
      .sort();
    expect(undeclared).toEqual([]);
  });

  it("does not keep a reason for a variable nothing reads any more", () => {
    const roots = ROOTS.map((root) => new URL(root, import.meta.url).pathname);
    const files = [
      ...roots.flatMap(sourceFiles),
      new URL("../nuxt.config.ts", import.meta.url).pathname,
    ];
    const read = new Set(
      files.flatMap((file) =>
        [...readFileSync(file, "utf8").matchAll(READ)].map(([, name]) => name as string)
      )
    );

    expect(Object.keys(OUTSIDE_TURBO).filter((name) => !read.has(name))).toEqual([]);
  });

  it("gives each browser guard a port of its own", () => {
    // The clash that started this. They are separate jobs in CI and never met there; locally they
    // are two commands somebody runs one after the other, and the second lost its server.
    const scripts = new URL("../scripts", import.meta.url).pathname;
    const ports = readdirSync(scripts)
      .filter((entry) => entry.endsWith(".mjs"))
      .flatMap((entry) =>
        [
          ...readFileSync(join(scripts, entry), "utf8").matchAll(
            /process\.env\.[A-Z_0-9]+ \?\? (\d{4})/g
          ),
        ].map(([, port]) => Number(port))
      );

    expect(ports.length).toBeGreaterThan(1);
    expect(new Set(ports).size).toBe(ports.length);
  });
});
