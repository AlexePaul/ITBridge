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

const md = new MarkdownIt({ html: false, linkify: false, typographer: false });

// A wide table has to scroll inside its own box, never the page: the retention table in the
// privacy notice is three columns of sentences.
md.renderer.rules.table_open = () => '<div class="table-scroll"><table>';
md.renderer.rules.table_close = () => "</table></div>";

export const renderLegalMarkdown = (source: string): RenderedLegalDocument => {
  const title = /^#\s+(.+)$/m.exec(source)?.[1]?.trim() ?? "";
  const version = /\*\*Versiunea (\d+\.\d+)/.exec(source)?.[1] ?? null;
  return { title, version, html: md.render(rewriteLinks(source)) };
};
