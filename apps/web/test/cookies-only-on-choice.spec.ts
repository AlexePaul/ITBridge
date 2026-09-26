import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The cookie policy (§2) names five cookies and says two of them appear only after a choice — the
 * child a parent picks, the location an admin filters by. Nuxt 4.5 writes a `useCookie` default the
 * first time the cookie is read, so a `default:` put both in every browser before any choice (the
 * testing of 26 September 2026 found them there). A preference cookie is declared without a default
 * and read with `?? fallback`; this keeps the next one from reaching for the option.
 */
const APP = new URL("../app/", import.meta.url).pathname;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|vue)$/.test(entry) ? [path] : [];
  });
}

/** Each `useCookie(` call with the text up to its closing parenthesis — enough for its options. */
function cookieCalls(text: string): string[] {
  const calls: string[] = [];
  let at = text.indexOf("useCookie");
  while (at !== -1) {
    const open = text.indexOf("(", at);
    let depth = 0;
    let end = open;
    for (; end < text.length; end++) {
      if (text[end] === "(") depth++;
      if (text[end] === ")" && --depth === 0) break;
    }
    if (open !== -1 && open - at < 40) calls.push(text.slice(at, end + 1));
    at = text.indexOf("useCookie", end);
  }
  return calls;
}

describe("cookies are written only when somebody chooses", () => {
  it("gives no cookie a default", () => {
    const offending = sources(APP).flatMap((file) =>
      cookieCalls(readFileSync(file, "utf8"))
        .filter((call) => /\bdefault\s*:/.test(call))
        .map((call) => `${file.replace(APP, "")}: ${call.split("\n")[0]}`)
    );

    expect(offending).toEqual([]);
  });

  it("keeps the admin sidebar out of the cookie jar", () => {
    const layout = readFileSync(join(APP, "layouts/dashboard.vue"), "utf8");
    expect(layout).toContain('<UDashboardGroup storage="local">');
    expect(layout).toContain('<UDashboardSidebar id="admin"');
  });
});

describe("Profil: one session closed at a time", () => {
  const PROFILE = readFileSync(join(APP, "pages/user/profile.vue"), "utf8");

  it("offers to close every session but this browser's own", () => {
    expect(PROFILE).toMatch(/v-if="!session\.current"[\s\S]{0,400}onCloseSession\(session\.id\)/);
  });

  /** The same browser signed in twice is two rows of the same device (E18/S6's duplicate names). */
  it("names each button by its row, so two of the same browser are not two identical buttons", () => {
    expect(PROFILE).toContain("`Închide sesiunea ${index + 1}: ${deviceLabel(session.userAgent)}");
  });
});
