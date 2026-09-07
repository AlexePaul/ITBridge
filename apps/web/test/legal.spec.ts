import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderLegalMarkdown } from "../server/utils/legal-markdown";
import { LEGAL_DOCUMENTS } from "../shared/legal";

const legalDir = fileURLToPath(new URL("../../../docs/legal/", import.meta.url));

describe("renderLegalMarkdown", () => {
  it("renders every document with its own title and a version to record", () => {
    for (const { file } of Object.values(LEGAL_DOCUMENTS)) {
      const rendered = renderLegalMarkdown(readFileSync(`${legalDir}${file}`, "utf8"));

      expect(rendered.title.length).toBeGreaterThan(10);
      expect(rendered.version).toMatch(/^\d+\.\d+$/);
      expect(rendered.html).toContain("<h1>");
    }
  });

  it("turns links between the documents into links between the pages", () => {
    const { html } = renderLegalMarkdown(
      "Vezi [Politica de confidențialitate](politica-de-confidentialitate.md) și [README](README.md)."
    );

    expect(html).toContain('href="/confidentialitate"');
    expect(html).not.toContain("README.md");
    expect(html).toContain("README");
  });

  it("wraps a table so a wide one scrolls inside its own box, not the page", () => {
    const { html } = renderLegalMarkdown("| a | b |\n| --- | --- |\n| 1 | 2 |\n");

    expect(html).toContain('<div class="table-scroll"><table>');
    expect(html).toContain("</table></div>");
  });

  it("never lets raw HTML through, even from the source", () => {
    const { html } = renderLegalMarkdown("<script>alert(1)</script>");

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
