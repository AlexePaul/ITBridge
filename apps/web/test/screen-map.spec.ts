import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SCREEN_MAP_PATH, renderScreenMap } from "../scripts/screen-map.mjs";

/**
 * `docs/harta-ecranelor.md` — every screen, its file, the requests it makes and who answers them —
 * is rendered from the sources, and this keeps it that way. A map that is a week behind sends the
 * person fixing a bug to the wrong file with confidence, which is worse than no map.
 *
 * It also catches a real bug on the way: a screen calling a route the API does not have. Nothing
 * else would — the build passes, the types pass, and the request 404s only when somebody clicks.
 */
describe("the screen map", () => {
  const rendered = renderScreenMap();

  it("is what the sources render today — run `pnpm --filter web screens:render`", () => {
    expect(readFileSync(SCREEN_MAP_PATH, "utf8")).toBe(rendered);
  });

  it("finds a handler for every request a screen makes", () => {
    const unanswered = rendered
      .split("\n")
      .filter((line) => line.includes("nicio rută cu forma asta"));
    expect(unanswered).toEqual([]);
  });

  it("sees the requests of the screens it is written for", () => {
    // A map that parsed nothing would pass the two checks above as well.
    expect(rendered).toContain("### `/admin/erori` — Erori");
    expect(rendered).toMatch(/`GET \/errors` \| `ErrorReportController\.list`/);
    expect(rendered).toMatch(/`POST \/payments` \| `PaymentController\./);
  });
});
