import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { launchChromium, publicPaths, startPreviewServer } from "./preview-site.mjs";

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
 *
 * Booting the built site and launching the browser live in `preview-site.mjs`, shared with
 * `check-third-party.mjs`.
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

const require = createRequire(import.meta.url);
const AXE_SOURCE = readFileSync(join(dirname(require.resolve("axe-core")), "axe.min.js"), "utf8");

async function violationsOn(context, base, path) {
  const page = await context.newPage();
  try {
    const response = await page.goto(`${base}${path}`, { waitUntil: "load" });
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
  const { base, stop } = await startPreviewServer(PORT);
  let browser;
  let failures = 0;
  let failedPages = 0;

  try {
    const paths = await publicPaths(base);
    browser = await launchChromium();

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
        const violations = await violationsOn(context, base, path);
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
    stop();
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
