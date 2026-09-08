import { launchChromium, publicPaths, startPreviewServer } from "./preview-site.mjs";

/**
 * E19/S9 — every internal link on the public site goes somewhere, checked at every PR.
 *
 * A broken link is not a bug that announces itself. It sits there until a reader hits it, or until
 * Search Console reports the 404 a month later, by which time Google has seen it before we have.
 * This makes it fail the PR that introduced it.
 *
 * **Why it did not exist before, and why it does now.** The site is small — seven pages, two
 * locations, three legal — and the links between them live in `AppFooter` and the navigation, so a
 * broken one would have shown up the first time anybody walked the site. The story is a guard for
 * the site of S4 and S6, where the links are in prose rather than in components and nobody walks
 * all of it any more.
 *
 * **Internal only.** A third-party site down for an hour is not a reason for our CI to be red, so
 * the maps, the Google Business profiles and the social accounts are somebody's monthly reading in
 * S8, not a gate here. That is the story's line, not a shortcut: it also means this check makes no
 * external request, like its two neighbours.
 *
 * **Broken means what the story says it means**: an internal `<a href>` that answers something
 * other than 200, or a `#fragment` with no element of that id on the page it points at. Fragments
 * matter more than they look — they are the half a status code cannot see, and the half that
 * breaks when a heading is reworded.
 *
 * **Links are collected from the rendered page, not from the source.** A real browser is what the
 * sibling checks already pay for, and it is what a reader has: a link built at runtime counts, and
 * a link that only exists in a `.vue` file that nothing renders does not.
 *
 * Pages come from the sitemap; targets do not have to. `/auth/login` is linked from the navigation
 * and is deliberately absent from the sitemap, and it is exactly as broken as any other page if it
 * stops answering.
 */

const PORT = Number(process.env.LINK_CHECK_PORT ?? 3125);

/** What a link can be, other than a page on this site. */
const isCheckable = (href) => {
  if (!href) return false;
  // `mailto:`, `tel:`, `javascript:` and friends do not have a status code.
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) && !/^https?:/i.test(href)) return false;
  return true;
};

/**
 * One page's links and the ids it offers, read from the DOM.
 *
 * Both halves come from the same visit because a page is both a source of links and a possible
 * target of a fragment, and loading it twice to learn two things about it is a waste of the only
 * slow step in the run.
 */
async function readPage(context, base, path) {
  const page = await context.newPage();
  try {
    const response = await page.goto(`${base}${path}`, { waitUntil: "load" });
    if (!response || !response.ok()) {
      throw new Error(`${path} answered ${response ? response.status() : "nothing"}`);
    }
    return await page.evaluate(() => ({
      hrefs: [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")),
      ids: [...document.querySelectorAll("[id]")].map((el) => el.id),
    }));
  } finally {
    await page.close();
  }
}

/** The ids a page offers, for a fragment that points at a page the crawl did not start from. */
async function readIds(context, url) {
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "load" });
    return await page.evaluate(() => [...document.querySelectorAll("[id]")].map((el) => el.id));
  } finally {
    await page.close();
  }
}

async function main() {
  const { base, stop } = await startPreviewServer(PORT);
  const origin = new URL(base).origin;
  let browser;

  /**
   * Broken links, keyed by target and reason.
   *
   * Grouped rather than listed per page because the links most likely to break are the ones in
   * `AppFooter` and the navigation, which appear on every page: ungrouped, one bad footer link
   * reports eleven times and buries the second finding under the first one's repetitions.
   */
  const broken = new Map();
  const report = (from, href, why) => {
    const key = `${href}\u0000${why}`;
    if (!broken.has(key)) broken.set(key, { href, why, from: [] });
    broken.get(key).from.push(from);
  };
  /** `pathname` → the ids that page offers, for pages already opened. */
  const idsByPath = new Map();
  /** `pathname` → status, so a link repeated in the footer of every page is fetched once. */
  const statusByPath = new Map();
  let internalLinks = 0;
  let externalLinks = 0;

  try {
    const paths = await publicPaths(base);
    browser = await launchChromium();
    const context = await browser.newContext();

    // Pass one: read every page the sitemap publishes, keeping its links and its ids.
    const pages = new Map();
    for (const path of paths) {
      const { hrefs, ids } = await readPage(context, base, path);
      pages.set(path, hrefs);
      idsByPath.set(path, new Set(ids));
    }

    // Pass two: resolve each link and ask what is at the other end.
    for (const [from, hrefs] of pages) {
      for (const href of hrefs) {
        if (!isCheckable(href)) continue;
        const target = new URL(href, `${base}${from}`);
        if (target.origin !== origin) {
          externalLinks += 1;
          continue;
        }
        internalLinks += 1;

        if (!statusByPath.has(target.pathname)) {
          // `fetch` follows redirects, which is the right answer: the old `.ro` addresses and the
          // English ones are 301s on purpose, and a link that lands on a page is not broken.
          const res = await fetch(`${origin}${target.pathname}${target.search}`, {
            redirect: "follow",
          });
          statusByPath.set(target.pathname, res.status);
        }
        const status = statusByPath.get(target.pathname);
        if (status !== 200) {
          report(from, href, `answered ${status}`);
          continue;
        }

        if (!target.hash || target.hash === "#") continue;
        const fragment = decodeURIComponent(target.hash.slice(1));
        if (!idsByPath.has(target.pathname)) {
          idsByPath.set(
            target.pathname,
            new Set(await readIds(context, `${origin}${target.pathname}`))
          );
        }
        if (!idsByPath.get(target.pathname).has(fragment)) {
          report(from, href, `no element with id "${fragment}" on that page`);
        }
      }
    }

    await context.close();
  } finally {
    await browser?.close();
    stop();
  }

  console.log(
    `  Checked ${internalLinks} internal link(s); left ${externalLinks} external one(s) to the monthly reading in E19 S8.`
  );

  if (broken.size > 0) {
    console.error(`\nFAIL  ${broken.size} broken internal link(s):`);
    for (const { href, why, from } of broken.values()) {
      console.error(`        ${href} — ${why}`);
      const shown = from.slice(0, 3).join(", ");
      console.error(
        `          linked from ${from.length} page(s): ${shown}${from.length > 3 ? ", …" : ""}`
      );
    }
    console.error(
      "\nA link that answers 404 is one a reader follows and one Google records. Fix the link, or the page it was pointing at."
    );
    process.exitCode = 1;
    return;
  }
  console.log("\nEvery internal link on the public pages answers 200, fragments included.");
}

await main();
