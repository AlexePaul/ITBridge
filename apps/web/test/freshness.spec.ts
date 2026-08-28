import { describe, expect, it } from "vitest";
import { CONTENT_UPDATED, CONTENT_UPDATED_ISO, PUBLIC_PAGES, pageSeo } from "../shared/seo";
import { webPageNode } from "../shared/structured-data";

describe("CONTENT_UPDATED", () => {
  it("is a date schema.org can parse", () => {
    expect(CONTENT_UPDATED_ISO).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(CONTENT_UPDATED_ISO))).toBe(false);
  });

  it("reads as a Romanian month, derived from the same constant", () => {
    expect(CONTENT_UPDATED).toBe("august 2026");
  });

  it("never falls back to an undefined month, whatever the date says", () => {
    expect(CONTENT_UPDATED).not.toContain("undefined");
  });
});

describe("webPageNode", () => {
  const site = "https://itbridgeschool.com";

  it("dates every public page, so an older copy of the same facts loses", () => {
    for (const page of PUBLIC_PAGES) {
      expect(webPageNode(site, page).dateModified).toBe(CONTENT_UPDATED_ISO);
    }
  });

  it("carries the date on a location page too, where the address is the fact", () => {
    const node = webPageNode(site, pageSeo("/locatii/straulesti"), "whatever#locatie");
    expect(node.dateModified).toBe(CONTENT_UPDATED_ISO);
  });
});
