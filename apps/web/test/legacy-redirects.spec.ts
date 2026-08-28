import { describe, expect, it } from "vitest";
import { LEGACY_REDIRECTS, legacyRouteRules } from "../shared/legacy-redirects";
import { PUBLIC_PAGES } from "../shared/seo";

const realPaths = new Set(PUBLIC_PAGES.map((page) => page.path));

describe("LEGACY_REDIRECTS", () => {
  it("sends every old path to a page that exists", () => {
    for (const [from, to] of Object.entries(LEGACY_REDIRECTS)) {
      expect(realPaths, `${from} points at ${to}, which is not a public page`).toContain(to);
    }
  });

  it("covers the old paths Search Console and the Wayback Machine still know", () => {
    expect(Object.keys(LEGACY_REDIRECTS)).toEqual(
      expect.arrayContaining(["/cursuri-inscrieri", "/lectii-online"])
    );
  });

  it("never redirects a path onto itself", () => {
    for (const [from, to] of Object.entries(LEGACY_REDIRECTS)) {
      expect(from).not.toBe(to);
    }
  });
});

describe("legacyRouteRules", () => {
  const rules = legacyRouteRules();

  it("registers each path bare and wildcarded, so a trailing slash still matches", () => {
    expect(rules["/lectii-online"]).toEqual({ redirect: { to: "/cursuri", statusCode: 301 } });
    expect(rules["/lectii-online/**"]).toEqual({ redirect: { to: "/cursuri", statusCode: 301 } });
  });

  it("redirects permanently — a 302 would keep the old URL in the index", () => {
    for (const rule of Object.values(rules)) {
      expect(rule.redirect.statusCode).toBe(301);
    }
  });

  it("does not resurrect the cookie policy, which is genuinely gone", () => {
    expect(rules).not.toHaveProperty("/politica-de-cookies");
  });
});
