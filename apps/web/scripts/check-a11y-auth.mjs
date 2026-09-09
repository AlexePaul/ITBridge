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
 * guarantee the public half cannot give — the shared admin components are used by 44 of the 51
 * screens, so a token edited once is 44 screens changed at once, in a place no reviewer opens.
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

/** Every screen, as a route path — `[param]` segments still in place. */
function allRoutes() {
  const out = [];
  for (const area of AREAS) {
    for (const file of pageFiles(join(PAGES_ROOT, area)).sort()) {
      out.push("/" + file.replace(/\.vue$/, "").replace(/\/index$/, ""));
    }
  }
  return out;
}

/**
 * Where each `[param]` gets a value that exists.
 *
 * A screen that takes an id cannot be visited blind, and inventing one checks an error page rather
 * than the screen. Fourteen of them were simply listed as uncovered — honest, but
 * `/admin/children/[childId]/edit` is opened every day, so "we do not check the ones people use"
 * is a poor place to stop. Asking the API for one real id each turns the whole set into ordinary
 * screens.
 *
 * The first row of each collection, not a random one: a run that checks a different screen every
 * time reports a different answer every time, and the first failure would be unreproducible.
 */
const PARAM_SOURCES = {
  childId: { path: "/children", read: (row) => row.id },
  groupId: { path: "/groups", read: (row) => row.id },
  profileId: { path: "/profiles", read: (row) => row.id },
  locationId: { path: "/locations", read: (row) => row.id },
  invoiceId: { path: "/invoices", read: (row) => row.id },
  month: { path: "/invoices", read: (row) => row.monthIssued },
};

async function resolveParams() {
  const apiBase = process.env.API_BASE;
  const auth = await fetch(`${apiBase}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: USERNAME, password: PASSWORD }),
  });
  if (!auth.ok) throw new Error(`Signing in to read sample ids answered ${auth.status}.`);
  const { accessToken } = await auth.json();

  const collections = new Map();
  const values = {};
  for (const [param, { path, read }] of Object.entries(PARAM_SOURCES)) {
    if (!collections.has(path)) {
      const res = await fetch(`${apiBase}${path}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      collections.set(path, res.ok ? await res.json() : []);
    }
    const rows = collections.get(path);
    const value = Array.isArray(rows) && rows.length ? read(rows[0]) : undefined;
    if (value !== undefined && value !== null) values[param] = String(value);
  }
  return values;
}

/**
 * The screens, split into the ones a URL can be built for and the ones it cannot.
 *
 * A path stays uncovered only when its parameter has no value to stand in — an empty seed, or a
 * `[param]` nothing in `PARAM_SOURCES` knows about. Either way it is named and counted rather than
 * dropped, so the gap is a number somebody can read.
 */
function routes(params) {
  const visitable = [];
  const parameterised = [];
  for (const route of allRoutes()) {
    const names = [...route.matchAll(/\[(\w+)\]/g)].map((m) => m[1]);
    if (names.length === 0) {
      visitable.push({ route, path: route });
      continue;
    }
    if (names.every((name) => params[name])) {
      const path = names.reduce((acc, name) => acc.replace(`[${name}]`, params[name]), route);
      visitable.push({ route, path });
    } else {
      parameterised.push(route);
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
    // These screens fetch after hydration and render nothing until the answer arrives, so the wait
    // is for the network to go quiet rather than for `load`. The timeout is swallowed because a
    // slow screen is still worth measuring — and the check below is what makes that safe.
    await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => {});

    // A screen still on `AdminLoading` has nothing on it, and nothing has no violations: it would
    // report `ok` and mean it, which is the one shape of green this file exists to avoid.
    //
    // **Shown to fire before being trusted.** Hanging one endpoint — the promise never resolves,
    // rather than failing, which would draw the error card instead — leaves `/admin/children` on
    // "Se încarcă…" with zero rows, and the predicate returns true. Two earlier attempts blocked
    // every call instead, which took the token refresh with them: the app decided the session was
    // gone, redirected to the login page, and the predicate was only ever observed returning false.
    // A guard that has only been seen not firing is not a guard.
    const stillLoading = await page.evaluate(() =>
      [...document.querySelectorAll('[role="status"]')].some((el) =>
        /Se încarcă/.test(el.textContent ?? "")
      )
    );
    if (stillLoading) {
      throw new Error(
        `${path} was still loading after 15s, so there was nothing on it to check. A screen that renders no content cannot fail an accessibility rule — reporting it as ok would be the check reporting on itself.`
      );
    }

    await page.addScriptTag({ content: AXE_SOURCE });
    const violations = await page.evaluate(async (tags) => {
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

    return [...violations, ...(await nameProblemsOn(page))];
  } finally {
    await page.close();
  }
}

/**
 * The two things wrong with a control's name that axe will never tell you about.
 *
 * Axe asks whether a control **has** a name, and stops there. Both of these passed it on every
 * screen and neither is usable:
 *
 * - **A name repeated across the screen.** Twenty rows named "Acțiuni", three date pickers named
 *   "Alege data din calendar", fourteen buttons named "Luna anterioară" — read out as a list of
 *   controls, that is fourteen identical entries and no way to pick one. Found by walking the
 *   screens; every instance was a component drawn in a loop, which is why reading the source finds
 *   none of it.
 * - **A name in English.** Everything a user sees is Romanian, and a default label from a
 *   dependency is still a label somebody hears. reka-ui's combobox trigger says "Show popup", and
 *   it reached **44 screens** through one unlabelled `USelectMenu` in the admin navbar. Nothing in
 *   this repo said "Show popup"; grep could not have found it.
 *
 * They are returned in the same shape as an axe violation so the reporting downstream does not
 * need to know the difference — a control nobody can tell apart from another is an accessibility
 * failure whether or not a rule engine has a rule for it.
 */
async function nameProblemsOn(page) {
  return await page.evaluate(() => {
    const ENGLISH =
      /^(Show popup|Open|Close|Toggle|Select|Search|No data|Previous|Next|Submit|Clear|Menu|Loading)\b/i;
    const SELECTOR =
      'button, a[aria-label], [role="button"], [role="switch"], [role="checkbox"], [role="combobox"]';

    const named = [...document.querySelectorAll(SELECTOR)]
      .filter((el) => el.offsetParent !== null || el.getClientRects().length > 0)
      .map((el) => (el.getAttribute("aria-label") ?? "").trim())
      .filter(Boolean);

    const out = [];

    const counts = new Map();
    for (const name of named) counts.set(name, (counts.get(name) ?? 0) + 1);
    const repeated = [...counts].filter(([, n]) => n > 1);
    if (repeated.length > 0) {
      out.push({
        id: "duplicate-control-name",
        impact: "serious",
        help: "Two or more controls on this screen answer to the same name",
        nodes: repeated
          .slice(0, 5)
          .map(([name, n]) => ({ target: `aria-label="${name}"`, summary: `${n} controls` })),
        total: repeated.length,
      });
    }

    const english = [...new Set(named.filter((name) => ENGLISH.test(name)))];
    if (english.length > 0) {
      out.push({
        id: "english-control-name",
        impact: "serious",
        help: "A control is named in English; everything a user hears or reads is Romanian",
        nodes: english.slice(0, 5).map((name) => ({ target: `aria-label="${name}"`, summary: "" })),
        total: english.length,
      });
    }

    return out;
  });
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
  const params = await resolveParams();
  const { visitable, parameterised } = routes(params);
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
      for (const { route, path } of visitable) {
        const violations = await violationsOn(context, base, path);
        // The route, not the resolved path: `/admin/children/[childId]/edit` is the thing that
        // failed, and the id it happened to be checked with is noise in a diff.
        const label = `${route} (${colorScheme})`;
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

  if (parameterised.length > 0) {
    console.log(
      `\n${parameterised.length} screen(s) have a parameter nothing could stand in for, and were not visited: ${parameterised.join(", ")}`
    );
  }

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
