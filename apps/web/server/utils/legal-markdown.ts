import MarkdownIt from "markdown-it";
import { LEGAL_DOCUMENTS, type RenderedLegalDocument } from "../../shared/legal";

/**
 * Markdown from `docs/legal/` to the HTML the legal pages show.
 *
 * The files are written for the repository as much as for the reader: they link each other by
 * file name and they link the README, which is not a page. Both are rewritten on the source before
 * rendering — a link between the documents becomes a link between the pages, and a link to the
 * README becomes its text.
 *
 * `html: false` is the default and is kept on purpose: the source is our own, but the renderer
 * has no reason to trust it more than it needs to.
 */
const rewriteLinks = (markdown: string): string => {
  let out = markdown.replace(/\[([^\]]+)\]\(README\.md\)/g, "$1");
  for (const [slug, { file }] of Object.entries(LEGAL_DOCUMENTS)) {
    out = out.split(`](${file})`).join(`](/${slug})`);
  }
  return out;
};

/**
 * A heading's id, from its own text: lowercase, diacritics folded, everything else a hyphen.
 *
 * `## 14. Reguli de utilizare` becomes `14-reguli-de-utilizare`, so a link can point at a clause
 * rather than at the top of a twenty-section document. That matters most where the reader is asked
 * to accept named sections separately — the registration form links §14, §15 and §18 by fragment,
 * because Cod civil art. 1203 is about the reader actually finding what they are accepting.
 *
 * Diacritics are folded rather than kept: an id survives in a URL, in a bookmark and in somebody's
 * email, and `#raspundere` travels where `#răspundere` gets percent-encoded into noise.
 */
export const headingSlug = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // ș and ț are written with a comma below in Romanian, which NFD does not decompose.
    .replace(/[șş]/gi, "s")
    .replace(/[țţ]/gi, "t")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const md = new MarkdownIt({ html: false, linkify: false, typographer: false });

// A wide table has to scroll inside its own box, never the page: the retention table in the
// privacy notice is three columns of sentences.
md.renderer.rules.table_open = () => '<div class="table-scroll"><table>';
md.renderer.rules.table_close = () => "</table></div>";

/**
 * Ids on every heading, deduplicated.
 *
 * Written as a rule here rather than pulled in as `markdown-it-anchor`: it is fifteen lines, and
 * the repository has been bitten twice by a dependency that turned out to be ESM-only. The suffix
 * on a repeat is what keeps the page valid — two elements sharing an id is an accessibility
 * failure, and `pnpm test:a11y` would find it on a page nobody edits by hand.
 */
const withHeadingIds = (tokens: ReturnType<typeof md.parse>): void => {
  const used = new Map<string, number>();

  tokens.forEach((token, index) => {
    if (token.type !== "heading_open") return;

    const text = tokens[index + 1]?.content ?? "";
    const base = headingSlug(text);
    if (!base) return;

    const seen = used.get(base) ?? 0;
    used.set(base, seen + 1);
    token.attrSet("id", seen === 0 ? base : `${base}-${seen + 1}`);
  });
};

export const renderLegalMarkdown = (source: string): RenderedLegalDocument => {
  const title = /^#\s+(.+)$/m.exec(source)?.[1]?.trim() ?? "";
  const version = /\*\*Versiunea (\d+\.\d+)/.exec(source)?.[1] ?? null;
  const tokens = md.parse(rewriteLinks(source), {});
  withHeadingIds(tokens);

  return { title, version, html: md.renderer.render(tokens, md.options, {}) };
};
