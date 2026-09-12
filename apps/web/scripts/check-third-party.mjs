import { launchChromium, publicPaths, startPreviewServer } from "./preview-site.mjs";

/**
 * E07/S5's acceptance, run rather than remembered: **no request to a third-party domain leaves a
 * public page, and no cookie is set, before the reader has agreed to it.**
 *
 * The story asks for this "verified in the network tab, not in configuration", and it means it —
 * the bug it was written for was configuration that read as safe. The map iframe carried
 * `loading="lazy"`, which sounds like restraint and is the opposite: it fires the moment the
 * reader scrolls near it, so Google learned the visitor's IP from a page nobody had pressed a
 * button on. Nothing in the source said "call Google on scroll"; the browser said it.
 *
 * So this loads every page the sitemap publishes in a real Chromium, scrolls each one to the
 * bottom to give anything lazy its cue, and fails on the first request that leaves the origin.
 *
 * **Scrolling is the whole point of the run**, not a flourish. Without it the old bug passes: the
 * iframe below the fold never enters the viewport, never fires, and the check reports a clean
 * network on a page that would call Google the instant a reader moved.
 *
 * **Cookies are checked too**, because the story's other half is "no non-essential cookie before
 * accepting". On the public site the honest number is zero — the four cookies the policy names all
 * belong to the portal, behind a login — so anything at all here is a finding. That is a stronger
 * line than "no non-essential cookie" and a much easier one to check, and the cookie policy makes
 * the same promise to the reader in as many words.
 *
 * What this does **not** do is press the button. A reader who asks for the map gets Google, on
 * purpose and with the consequences written next to the button; the guard is about what happens
 * to a reader who does not.
 */

// 3126, not 3124: that one belongs to `check-a11y-auth.mjs`, and it is written into CI's
// `CORS_ORIGINS` and into CLAUDE.md twice, so this is the one that moves. The two checks are
// separate jobs in CI and never met there; locally they are two commands somebody runs together.
const PORT = Number(process.env.THIRD_PARTY_PORT ?? 3126);

/**
 * How far a page is scrolled, and how long anything lazy is given to fire.
 *
 * A single jump to the bottom is not enough: `loading="lazy"` and `IntersectionObserver` both key
 * off elements coming into view, and a page that teleports past them can leave them unobserved.
 * Stepping down a viewport at a time is what a reader does.
 */
async function scrollThrough(page) {
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise((resolve) => setTimeout(resolve, 400));
  });
  // Anything the last scroll started still has to be allowed to leave.
  await page.waitForTimeout(500);
}

async function auditPage(context, base, path) {
  const origin = new URL(base).origin;
  const page = await context.newPage();
  /** Foreign requests, deduplicated by origin so one embed is one line, not forty. */
  const foreign = new Map();

  page.on("request", (request) => {
    const url = request.url();
    // `data:` and `blob:` never leave the machine, and `about:blank` is not a fetch.
    if (!url.startsWith("http://") && !url.startsWith("https://")) return;
    const requestOrigin = new URL(url).origin;
    if (requestOrigin === origin) return;
    if (!foreign.has(requestOrigin)) foreign.set(requestOrigin, url);
  });

  try {
    const response = await page.goto(`${base}${path}`, { waitUntil: "load" });
    if (!response || !response.ok()) {
      throw new Error(`${path} answered ${response ? response.status() : "nothing"}`);
    }
    await scrollThrough(page);
    const cookies = await context.cookies();
    return { foreign: [...foreign.entries()], cookies };
  } finally {
    await page.close();
  }
}

/**
 * The other half of a gate: that pressing the button actually shows the map.
 *
 * A gate that blocks and then shows nothing is not a safe gate, it is a broken page, and this one
 * came within a commit of shipping. `useReveal` clips every `.plate` to nothing until its observer
 * marks it revealed, and the observer takes its census once, at mount — so a plate that appears
 * later never gets marked, and stays clipped for good. The reader presses, Google gets the
 * request, and the box stays empty. Nothing about it is visible in the source of either file.
 *
 * **It waits for the wipe rather than reading once.** The fixed version is not unclipped, it is
 * *animated* open: `classical-wipe` runs `both`, so for its delay and duration the computed clip
 * is whatever the keyframe says, starting at fully closed. Read at the instant the element
 * appears — which is what the first draft of this did — a working map is indistinguishable from
 * a broken one, and the check reported the bug it had just been used to fix.
 *
 * Google is routed to an abort first, so this stays what the rest of the run is: a check that
 * makes no third-party request. Whether the map answers is Google's business; whether the page
 * would show it is ours.
 */
async function gateOpensOn(context, base, path) {
  const page = await context.newPage();
  try {
    await page.route("**://*.google.com/**", (route) => route.abort());
    await page.goto(`${base}${path}`, { waitUntil: "load" });
    const button = page.getByRole("button", { name: "Încarcă harta" });
    if ((await button.count()) === 0) return null;

    await button.scrollIntoViewIfNeeded();
    await button.click();

    const plate = page.locator(".map-plate .plate");
    await plate.waitFor({ state: "attached", timeout: 5000 });
    const isOpen = (clip) => clip === "none" || /^inset\(0px 0px 0(\.0+)?%/.test(clip);

    const deadline = Date.now() + 4000;
    let clip = "";
    while (Date.now() < deadline) {
      clip = await plate.evaluate((el) => getComputedStyle(el).clipPath);
      if (isOpen(clip)) return null;
      await page.waitForTimeout(100);
    }
    return clip;
  } finally {
    await page.close();
  }
}

async function main() {
  const { base, stop } = await startPreviewServer(PORT);
  let browser;
  let networkFailures = 0;
  let gateFailures = 0;

  try {
    const paths = await publicPaths(base);
    browser = await launchChromium();

    for (const path of paths) {
      // A fresh context per page, so a cookie one page sets cannot be blamed on the next, and so
      // every page is measured as the first page of a first visit — which is what a reader
      // arriving from a search result actually is.
      const context = await browser.newContext();
      try {
        const { foreign, cookies } = await auditPage(context, base, path);
        if (foreign.length === 0 && cookies.length === 0) {
          console.log(`  ok  ${path}`);
          continue;
        }
        networkFailures += 1;
        console.error(`FAIL  ${path}`);
        for (const [requestOrigin, example] of foreign) {
          console.error(`        request to ${requestOrigin}`);
          console.error(`          e.g. ${example}`);
        }
        for (const cookie of cookies) {
          console.error(`        cookie ${cookie.name} (domain ${cookie.domain})`);
        }
      } finally {
        await context.close();
      }
    }

    // Second pass, on the pages that have a gate: pressing it has to show the map.
    for (const path of paths) {
      const context = await browser.newContext();
      try {
        const clipped = await gateOpensOn(context, base, path);
        if (clipped === null) continue;
        gateFailures += 1;
        console.error(`FAIL  ${path}`);
        console.error(`        the map stayed clipped after the button was pressed: ${clipped}`);
        console.error(
          `        the plate needs \`is-revealed\` — \`useReveal\` clips one that appears after its observer mounted`
        );
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser?.close();
    stop();
  }

  if (networkFailures > 0) {
    console.error(
      `\n${networkFailures} public page(s) reached a third party or set a cookie before the reader agreed to anything. If the request is one a reader asked for, it belongs behind the same gate as the map; if it is one the site needs, the cookie policy has to say so before this check is changed.`
    );
  }
  if (gateFailures > 0) {
    console.error(
      `\n${gateFailures} map gate(s) stayed shut after being pressed. The reader's request went to Google and they were shown an empty box, which is worse than either answer.`
    );
  }
  if (networkFailures > 0 || gateFailures > 0) {
    process.exitCode = 1;
    return;
  }
  console.log(
    "\nNo public page leaves the origin or sets a cookie on its own — which is what the cookie policy tells the reader — and every map gate opens when it is pressed."
  );
}

await main();
