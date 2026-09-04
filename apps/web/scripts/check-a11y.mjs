import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { chromium } from "playwright";

/**
 * The automated half of E18/S6 — accessibility, checked rather than remembered.
 *
 * The manual half is done and written up in the epic: contrast raised to AA, a skip link, visible
 * focus, form errors tied to their field, a keyboard-operable carousel. This is the part that keeps
 * it true. Without it nothing stops the next component reintroducing a 3:1 contrast, and the failure
 * is silent — a colour is not a test that goes red.
 *
 * **A real browser, not jsdom.** The obvious cheap version runs axe over the prerendered HTML with
 * no layout engine, and it would pass while doing nothing about the one thing this exists for: with
 * no cascade and no layout, colour contrast cannot be computed, so axe skips it. A green check that
 * cannot see the regression it was written for is worse than no check, because somebody trusts it.
 *
 * **Both colour schemes**, for the same reason. The tokens the story raised are declared twice, and
 * the dark ones sit at 3.09:1 — close enough to the line that an edit moves them across it. Checking
 * only the light theme would guard half of what was fixed.
 *
 * **The pages come from the sitemap**, not from a list in here. `PUBLIC_PAGES` in `shared/seo.ts`
 * already feeds the sitemap, so reading it back means a page added there is checked without anybody
 * remembering to add it twice — and it means what is checked is exactly what the site advertises.
 *
 * Only the public pages. The authenticated area is unchecked and stays that way until E18/S4 and S5,
 * which is written down in the epic rather than left to be discovered here.
 */

/** WCAG 2.0 and 2.1, levels A and AA — the standard the story names. */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

/**
 * `best-practice` is deliberately not in the list above.
 *
 * Those rules are advice, not the standard, and mixing them in makes the gate fail for things
 * nobody agreed to — which is how a check stops being read and starts being skipped.
 */

const PORT = Number(process.env.A11Y_PORT ?? 3123);
const BASE = `http://127.0.0.1:${PORT}`;
const SERVER_ENTRY = ".output/server/index.mjs";

/**
 * A browser that is already on the machine, when there is one.
 *
 * CI installs Chromium through Playwright's own installer and needs nothing here. Some environments
 * — this project's cloud sandboxes among them — ship a Chromium at a fixed path whose build number
 * does not match the pinned Playwright, and downloading a second copy of a browser to check a
 * handful of static pages is a poor trade. Unset, Playwright resolves its own, which is the ordinary path.
 */
const EXECUTABLE = process.env.A11Y_CHROMIUM_PATH;

/**
 * Chromium's own sandbox cannot start as root without user namespaces, which is the ordinary state
 * inside a container — it does not fail, it hangs, which costs a while to work out the first time.
 *
 * Off by default, and deliberately a separate switch from the one above: CI runs unprivileged and
 * keeps the sandbox, and a script that quietly dropped it everywhere would be weakening the browser
 * for everybody to spare one environment an env var.
 */
const NO_SANDBOX = process.env.A11Y_NO_SANDBOX === "1";

const require = createRequire(import.meta.url);
const AXE_SOURCE = readFileSync(join(dirname(require.resolve("axe-core")), "axe.min.js"), "utf8");

async function waitForServer(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {
      // Not up yet. The loop is the wait.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `The preview server did not answer on ${BASE} within ${timeoutMs / 1000}s. \`pnpm test:a11y\` from the root builds the site first; run on its own, the build has to be there already.`
  );
}

/** The paths the site publishes, read back from the sitemap it serves. */
async function publicPaths() {
  const xml = await (await fetch(`${BASE}/sitemap.xml`)).text();
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (match) => new URL(match[1]).pathname
  );
  if (paths.length === 0)
    throw new Error(
      "The sitemap listed no pages, so there is nothing to check — that is itself a failure."
    );
  return paths;
}

async function violationsOn(context, path) {
  const page = await context.newPage();
  try {
    const response = await page.goto(`${BASE}${path}`, { waitUntil: "load" });
    if (!response || !response.ok()) {
      throw new Error(`${path} answered ${response ? response.status() : "nothing"}`);
    }
    await page.addScriptTag({ content: AXE_SOURCE });
    // Serialised out of the page: axe's result carries DOM nodes, and only the readable parts
    // survive the boundary anyway.
    return await page.evaluate(async (tags) => {
      const result = await window.axe.run(document, { runOnly: { type: "tag", values: tags } });
      return result.violations.map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        nodes: violation.nodes
          .slice(0, 5)
          .map((node) => ({ target: node.target.join(" "), summary: node.failureSummary })),
        total: violation.nodes.length,
      }));
    }, TAGS);
  } finally {
    await page.close();
  }
}

async function main() {
  // No shell. `sh -c` would be the parent of the server rather than the server itself, and the
  // kill at the end would take the shell and leave the server holding the port — which is not a
  // tidiness problem: the next run finds the port taken, its own server dies, and it checks the
  // stale build still answering there while reporting "ok" on every page.
  const server = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: process.cwd(),
    // `SITE_URL` is deliberately not set: unset is what production uses, and it only affects
    // canonical tags and JSON-LD ids, neither of which this looks at.
    env: { ...process.env, PORT: String(PORT), NITRO_PORT: String(PORT), NODE_ENV: "production" },
    stdio: ["ignore", "ignore", "inherit"],
  });

  /**
   * The server's own death, as something the wait can lose a race to.
   *
   * A health check that only asks whether *something* answers on the port cannot tell our build
   * from anybody else's — and the case where they differ is precisely the case where the server
   * did not start. Watching the child settles it: if it exits, there is nothing of ours there.
   *
   * The no-op catch is for the ordinary ending, where we kill it on purpose: a rejection nobody
   * is racing any more is still a rejection, and Node ends the process over one.
   */
  const serverDied = new Promise((_, reject) => {
    server.once("exit", (code, signal) => {
      reject(
        new Error(
          `The preview server exited (${signal ?? `code ${code}`}) instead of serving ${BASE}. If the port was taken, whatever holds it would have answered in its place.`
        )
      );
    });
  });
  serverDied.catch(() => {});

  let browser;
  let failures = 0;
  let failedPages = 0;

  try {
    await Promise.race([waitForServer(), serverDied]);
    const paths = await publicPaths();
    browser = await chromium.launch({
      ...(EXECUTABLE ? { executablePath: EXECUTABLE } : {}),
      ...(NO_SANDBOX ? { args: ["--no-sandbox", "--disable-dev-shm-usage"] } : {}),
    });

    for (const colorScheme of ["light", "dark"]) {
      const context = await browser.newContext({
        colorScheme,
        // **Reduced motion, or the run measures a fade.** Blocks rise into place through
        // `classical-rise`, and axe reads the colour an element has at the instant it looks:
        // caught part-way through, the same `.lede` reported 1.47:1 on two pages and 1.18:1
        // on a third, which is not a contrast problem, it is a stopwatch problem. With the
        // preference on, `useReveal` returns early and nothing is hidden at all — so this is
        // not a special case for the test, it is the page a reader with the setting on gets,
        // and it is the only way the result is the same twice.
        reducedMotion: "reduce",
      });
      for (const path of paths) {
        const violations = await violationsOn(context, path);
        const label = `${path} (${colorScheme})`;
        if (violations.length === 0) {
          console.log(`  ok  ${label}`);
          continue;
        }
        failures += violations.reduce((sum, violation) => sum + violation.total, 0);
        failedPages += 1;
        console.error(`FAIL  ${label}`);
        for (const violation of violations) {
          console.error(
            `        ${violation.id} [${violation.impact}] — ${violation.help} (${violation.total} node(s))`
          );
          for (const node of violation.nodes) {
            console.error(`          ${node.target}`);
            if (node.summary)
              console.error(`            ${node.summary.replace(/\n/g, "\n            ")}`);
          }
        }
      }
      await context.close();
    }
  } finally {
    await browser?.close();
    server.kill("SIGTERM");
  }

  if (failures > 0) {
    console.error(
      `\n${failures} accessibility violation(s) on ${failedPages} page(s). Each one is something somebody cannot use.`
    );
    process.exitCode = 1;
    return;
  }
  console.log("\nNo accessibility violations on the public pages, in either colour scheme.");
}

await main();
