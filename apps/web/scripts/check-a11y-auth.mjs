import { createRequire } from "node:module";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { launchChromium, startPreviewServer } from "./preview-site.mjs";

/**
 * The other half of E18/S6 — the same check, behind the login.
 *
 * `check-a11y.mjs` has guarded the public pages since the story's first half. Everything after
 * `/auth/login` was never measured at all, which the epic said out loud and deferred until S4 and
 * S5 had rewritten the screens. They have. The first run found **80 violations across 36 screens**,
 * and not one of them belonged to the screen it appeared on: six Nuxt UI colour tokens left at
 * their ramp's 500, a calendar wash at 2.12:1, four controls with no accessible name, and every
 * `AdminTable` row announcing itself as a button while containing buttons of its own. Four causes,
 * eighty symptoms — which is exactly the arithmetic that makes a gate worth its runtime, and
 * exactly the arithmetic nobody can do by looking.
 *
 * What it costs is the reason it did not exist earlier: the public check needs a built site and
 * nothing else, while this one needs a database, a seed and an API that answers, because a screen
 * with no data on it is not the screen anybody uses. That is a whole second CI job. It buys a
 * guarantee the public half cannot give — the shared admin components are used by 36 screens, so a
 * token edited once is 36 screens changed at once, in a place no reviewer opens.
 *
 * **The routes come from the filesystem, not from a list in here** — the same property the public
 * check gets from the sitemap, by the only route available on this side. `app/pages/admin/**` and
 * `app/pages/user/**` are the screens; a new one is checked without anybody remembering to add it
 * twice, and adding it to a list is precisely the step that gets skipped.
 *
 * **Parameterised routes are named, not dropped.** A path with a `[param]` in it cannot be visited
 * without knowing an id that exists, and inventing one would check an error page. They are printed
 * at the end with a count, so the gap is a number somebody can read rather than a silence.
 *
 * Both colour schemes, `prefers-reduced-motion: reduce`, WCAG 2.0 and 2.1 at A and AA, and
 * `best-practice` deliberately left out — all four for the reasons written up in `check-a11y.mjs`,
 * which owns them.
 */

/** WCAG 2.0 and 2.1, levels A and AA — the standard the story names. */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const PORT = Number(process.env.A11Y_AUTH_PORT ?? 3124);

/**
 * The seed's admin. The password is in the repo already (`apps/api/src/seed/seed.ts`), so hiding it
 * here would be theatre; the variables exist so a database seeded with `SEED_PASSWORD` can be used
 * instead of a fresh local one.
 */
const USERNAME = process.env.A11Y_AUTH_USER ?? "admin";
const PASSWORD = process.env.A11Y_AUTH_PASSWORD ?? "parola123";

const PAGES_ROOT = join(process.cwd(), "app", "pages");

/** The two trees that live behind the login. `auth/` is public and `check-a11y.mjs` has it. */
const AREAS = ["admin", "user"];

const require = createRequire(import.meta.url);
const AXE_SOURCE = readFileSync(join(dirname(require.resolve("axe-core")), "axe.min.js"), "utf8");

/** Every `.vue` under `dir`, as paths relative to `app/pages`. */
function pageFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...pageFiles(full));
    else if (entry.name.endsWith(".vue")) out.push(relative(PAGES_ROOT, full));
  }
  return out;
}

/**
 * The screens, split into the ones a URL can be built for and the ones it cannot.
 *
 * `admin/groups/[groupId]/edit.vue` needs a group that exists; `admin/children/index.vue` needs
 * nothing. Only the second kind can be visited blind.
 */
function routes() {
  const visitable = [];
  const parameterised = [];
  for (const area of AREAS) {
    for (const file of pageFiles(join(PAGES_ROOT, area)).sort()) {
      const path = "/" + file.replace(/\.vue$/, "").replace(/\/index$/, "");
      (path.includes("[") ? parameterised : visitable).push(path);
    }
  }
  return { visitable, parameterised };
}

/**
 * Signs the context in and leaves the tokens in its cookie jar, so every page after this one is
 * simply visited.
 *
 * The wait is for the cookie, not for a URL: login lands on `/`, which is where an unauthenticated
 * visitor lands too, so the address bar cannot tell the two apart. A wrong password would otherwise
 * scan every screen's login form and report them all clean.
 *
 * **The three ways this fails look identical from here**, so the failure says which one it was.
 * A dead API, a rejected password and a blocked origin all end the same way — no cookie — and the
 * third is the one that will catch people out: the preview server answers on `127.0.0.1`, so the
 * browser's origin is `http://127.0.0.1:<port>`, and unless that exact string is in the API's
 * `CORS_ORIGINS` every call is refused by the browser before the API ever hears it. Nothing is
 * logged server-side, because nothing reached the server.
 */
async function signIn(context, base) {
  const page = await context.newPage();
  const consoleErrors = [];
  const requestFailures = [];
  let loginStatus = null;

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text().slice(0, 300));
  });
  page.on("requestfailed", (request) => {
    requestFailures.push(`${request.url()} — ${request.failure()?.errorText ?? "failed"}`);
  });
  page.on("response", (response) => {
    // The method matters: a blocked call still gets a 200 to its OPTIONS preflight, and reading
    // that as "the API answered" points the diagnosis at the wrong half.
    if (response.url().endsWith("/auth/login") && response.request().method() === "POST") {
      loginStatus = response.status();
    }
  });

  try {
    await page.goto(`${base}/auth/login`, { waitUntil: "load" });
    await page.locator("#auth-username").fill(USERNAME);
    await page.locator("#auth-password").fill(PASSWORD);
    await page.locator('button[type="submit"]').first().click();

    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if ((await context.cookies()).some((cookie) => cookie.name === "accessToken")) return;
      await page.waitForTimeout(250);
    }

    const apiBase = process.env.API_BASE ?? "(API_BASE unset)";
    const diagnosis =
      loginStatus === null
        ? `The login request never got an answer. Either nothing is listening on ${apiBase}, or the browser refused to send it: this page is served from ${base}, so that exact origin has to be in the API's CORS_ORIGINS.`
        : loginStatus === 401
          ? `The API answered 401, so it is running and the credentials are wrong. Seed it with \`pnpm seed\`, or set A11Y_AUTH_USER and A11Y_AUTH_PASSWORD.`
          : `The API answered ${loginStatus}.`;

    throw new Error(
      [
        `Signing in as "${USERNAME}" left no access token after 30s.`,
        diagnosis,
        requestFailures.length ? `Failed requests: ${requestFailures.slice(0, 3).join(" | ")}` : "",
        consoleErrors.length ? `Console: ${consoleErrors.slice(0, 3).join(" | ")}` : "",
      ]
        .filter(Boolean)
        .join("\n  ")
    );
  } finally {
    await page.close();
  }
}

async function violationsOn(context, base, path) {
  const page = await context.newPage();
  try {
    const response = await page.goto(`${base}${path}`, { waitUntil: "load" });
    if (!response || !response.ok()) {
      throw new Error(`${path} answered ${response ? response.status() : "nothing"}`);
    }
    // These screens fetch after hydration and render nothing until the answer arrives — measuring
    // a spinner would pass every time. `networkidle` is the wrong tool: the portal holds a
    // long-poll open on some screens, so it never arrives.
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});
    await page.addScriptTag({ content: AXE_SOURCE });
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

/**
 * Asks the API, in one request, whether it will accept calls from the origin this run serves on.
 *
 * Worth the extra round trip because the failure it catches is otherwise a 30-second timeout with
 * no cause in it, and because the cause is nearly always the same: `CORS_ORIGINS` names the dev
 * server's port, this check serves the built site on another one, and the browser refuses every
 * call before the API hears about it. Nothing appears in the API log, because nothing arrived.
 */
async function assertApiAcceptsOrigin(origin) {
  const apiBase = process.env.API_BASE;
  if (!apiBase) {
    throw new Error(
      "API_BASE is unset, so the screens would load with nothing on them. This check reads them with data."
    );
  }

  let response;
  try {
    response = await fetch(`${apiBase}/auth/login`, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
      signal: AbortSignal.timeout(5000),
    });
  } catch (cause) {
    throw new Error(
      `Nothing answered at ${apiBase}. Start the API and seed it — this check reads the screens with data on them, and a screen with none is not the screen anybody uses.`,
      { cause }
    );
  }

  const allowed = response.headers.get("access-control-allow-origin");
  if (allowed !== origin && allowed !== "*") {
    throw new Error(
      `The API at ${apiBase} will not accept calls from ${origin} (it allows ${allowed ?? "no origin at all"}).\n  ` +
        `Every call the browser makes would be refused before the API heard it, so nothing would appear in its log.\n  ` +
        `Add that origin to CORS_ORIGINS for the run: CORS_ORIGINS=${origin} on the API process.`
    );
  }
}

async function main() {
  const { visitable, parameterised } = routes();
  if (visitable.length === 0) {
    throw new Error(
      "No authenticated screens were found under app/pages/admin or app/pages/user, so there is nothing to check — that is itself a failure."
    );
  }

  const { base, stop } = await startPreviewServer(PORT);
  try {
    await assertApiAcceptsOrigin(base);
  } catch (error) {
    stop();
    throw error;
  }

  let browser;
  let failures = 0;
  let failedPages = 0;

  try {
    browser = await launchChromium();

    for (const colorScheme of ["light", "dark"]) {
      const context = await browser.newContext({ colorScheme, reducedMotion: "reduce" });
      await signIn(context, base);
      for (const path of visitable) {
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

  console.log(
    `\n${parameterised.length} screen(s) take a parameter and are not visited: ${parameterised.join(", ")}`
  );

  if (failures > 0) {
    console.error(
      `\n${failures} accessibility violation(s) on ${failedPages} screen(s). Each one is something somebody cannot use.`
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `\nNo accessibility violations on ${visitable.length} authenticated screens, in either colour scheme.`
  );
}

await main();
