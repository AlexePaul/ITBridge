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
      expect(rendered.html).toMatch(/<h1[ >]/);
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

  it("gives every heading an id, so a link can point at a clause", () => {
    const { html } = renderLegalMarkdown(
      "# Termeni\n\n## 15. Disponibilitate, erori, răspundere\n"
    );

    // Diacritics folded on purpose: an id travels through a URL, a bookmark and somebody's email,
    // and `#raspundere` survives that where `#răspundere` becomes percent-encoded noise.
    expect(html).toContain('<h2 id="15-disponibilitate-erori-raspundere">');
  });

  it("keeps the ids the registration form links to", () => {
    // The second checkbox at registration names §14, §15 and §18 and links each one. Cod civil
    // art. 1203 is about the reader finding what they are accepting, so a heading reworded without
    // these being updated turns three links into a jump to nowhere — which `pnpm test:links`
    // catches only for pages it crawls, and the register form is not one of them.
    const { html } = renderLegalMarkdown(
      readFileSync(`${legalDir}${LEGAL_DOCUMENTS.termeni.file}`, "utf8")
    );

    for (const id of [
      "14-reguli-de-utilizare",
      "15-disponibilitate-erori-raspundere",
      "18-modificarea-termenilor",
    ]) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("never repeats an id, however often a heading repeats", () => {
    const { html } = renderLegalMarkdown("## Contact\n\n## Contact\n\n## Contact\n");

    // Two elements sharing an id is an accessibility failure on a page nobody edits by hand.
    expect(html).toContain('id="contact"');
    expect(html).toContain('id="contact-2"');
    expect(html).toContain('id="contact-3"');
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
