import { spawn } from "node:child_process";
import { chromium } from "playwright";

/**
 * Booting the built site and driving a real browser over the pages it publishes.
 *
 * Two checks need exactly this and nothing else — `check-a11y.mjs`, which runs axe, and
 * `check-third-party.mjs`, which watches the network — and every line below is a lesson one of
 * them paid for once. Copied into both, the copies would drift, and the one that drifts is the
 * one whose comment nobody reread.
 *
 * The environment variables keep the `A11Y_` prefix they were born with. It reads oddly now that
 * two scripts share them, but they are written down in CLAUDE.md and set in people's shells, and
 * the failure mode of renaming them is not an error message: `A11Y_NO_SANDBOX` unread means
 * Chromium's own sandbox tries to start as root, and it does not fail, it **hangs**.
 */

/** A browser that is already on the machine, when there is one. */
const EXECUTABLE = process.env.A11Y_CHROMIUM_PATH;

/**
 * Chromium's own sandbox cannot start as root without user namespaces, which is the ordinary state
 * inside a container.
 *
 * Off by default, and deliberately a separate switch from the one above: CI runs unprivileged and
 * keeps the sandbox, and a script that quietly dropped it everywhere would be weakening the browser
 * for everybody to spare one environment an env var.
 */
const NO_SANDBOX = process.env.A11Y_NO_SANDBOX === "1";

const SERVER_ENTRY = ".output/server/index.mjs";

async function waitForServer(base, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(base, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {
      // Not up yet. The loop is the wait.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(
    `The preview server did not answer on ${base} within ${timeoutMs / 1000}s. The root-level script builds the site first; run on its own, the build has to be there already.`
  );
}

/**
 * Starts the built site on `port` and resolves once it answers.
 *
 * Returns `{ base, stop }`. Call `stop()` in a `finally` — the caller owns the process from here.
 */
export async function startPreviewServer(port, { timeoutMs = 30_000 } = {}) {
  const base = `http://127.0.0.1:${port}`;

  // No shell. `sh -c` would be the parent of the server rather than the server itself, and the
  // kill at the end would take the shell and leave the server holding the port — which is not a
  // tidiness problem: the next run finds the port taken, its own server dies, and it checks the
  // stale build still answering there while reporting "ok" on every page.
  const server = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: process.cwd(),
    // `SITE_URL` is deliberately not set: unset is what production uses, and it only affects
    // canonical tags and JSON-LD ids, which neither caller looks at.
    env: { ...process.env, PORT: String(port), NITRO_PORT: String(port), NODE_ENV: "production" },
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
          `The preview server exited (${signal ?? `code ${code}`}) instead of serving ${base}. If the port was taken, whatever holds it would have answered in its place.`
        )
      );
    });
  });
  serverDied.catch(() => {});

  await Promise.race([waitForServer(base, timeoutMs), serverDied]);

  return { base, stop: () => server.kill("SIGTERM") };
}

/** The paths the site publishes, read back from the sitemap it serves. */
export async function publicPaths(base) {
  const xml = await (await fetch(`${base}/sitemap.xml`)).text();
  const paths = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    (match) => new URL(match[1]).pathname
  );
  if (paths.length === 0)
    throw new Error(
      "The sitemap listed no pages, so there is nothing to check — that is itself a failure."
    );
  return paths;
}

export function launchChromium() {
  return chromium.launch({
    ...(EXECUTABLE ? { executablePath: EXECUTABLE } : {}),
    ...(NO_SANDBOX ? { args: ["--no-sandbox", "--disable-dev-shm-usage"] } : {}),
  });
}
