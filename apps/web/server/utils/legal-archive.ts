import { createHash } from "node:crypto";
import type { PublishedVersion } from "../../shared/legal";
import { legalVersionOf, renderLegalMarkdown } from "./legal-markdown";

/**
 * The rules that keep a published legal text readable after it is replaced — terms §4.7, and
 * `docs/legal/README.md`, item 10.
 *
 * Pure, so `legal-versions.spec.ts` can hold them against invented histories as well as against the
 * repository's own. The promise is broken in exactly one change — the one that replaces a text
 * families accepted — and nobody reading that diff sees the family who will look for the old text a
 * year later. So the procedure is a gate on that change rather than a paragraph next to it.
 */

/** Where superseded versions are kept, relative to the repository root. */
export const LEGAL_ARCHIVE_DIR = "docs/legal/versiuni";

/** The document's first bold line — `**Versiunea 0.2 · ciornă din … · nepublicată.**` — or null. */
const headLineOf = (source: string): string | null =>
  /^\*\*Versiunea [^\n]*$/m.exec(source)?.[0] ?? null;

/**
 * A draft says so on its first line, or still has a fact or a decision to fill in. Either way it
 * was never put in front of a family, so it is not kept.
 */
export const isDraftLegalText = (source: string): boolean =>
  /nepublicat/i.test(headLineOf(source) ?? "") || source.includes("[[");

/**
 * The fingerprint a published text is recorded with: SHA-256 of **what the reader reads**, not of
 * the file.
 *
 * The Markdown is rendered, the tags dropped and the whitespace folded, so a table realigned by
 * prettier, a list marker changed or a checkout on Windows leaves it as it was — none of those is a
 * new text, and a gate that demanded a new version for them would be a gate people learn to
 * override. A changed word, a moved comma or a clause added is a new text, and changes it.
 */
export const legalTextFingerprint = (source: string): string => {
  const read = renderLegalMarkdown(source)
    .html.replace(/<[^>]*>/g, " ")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(read, "utf8").digest("hex");
};

export interface LegalArchiveState {
  slug: string;
  /** The document's file, for the messages: `docs/legal/termeni-si-conditii.md`. */
  file: string;
  /** The document as it stands. */
  current: string;
  /** The versions recorded as published, oldest first. */
  published: readonly PublishedVersion[];
  /** The archived texts, by the version their file is named after. */
  archived: ReadonlyMap<string, string>;
}

/**
 * What stands between the repository and the promise, one sentence each; empty when it holds.
 *
 * Written for the developer who meets them in CI, so each one says what to do next — the
 * fingerprint to paste, or the command that recovers a text already overwritten.
 */
export function legalArchiveProblems(state: LegalArchiveState): string[] {
  const { slug, file, current, published, archived } = state;
  const problems: string[] = [];
  const version = legalVersionOf(current);
  if (!version) {
    return [`${file} has no "**Versiunea X.Y" line, so nothing can record which text was accepted`];
  }

  const listed = new Set<string>();
  for (const entry of published) {
    if (listed.has(entry.version)) {
      problems.push(`PUBLISHED_VERSIONS.${slug} lists ${entry.version} twice`);
    }
    listed.add(entry.version);
  }

  const inForce = published.find((entry) => entry.version === version);
  if (inForce) {
    if (published[published.length - 1] !== inForce) {
      problems.push(
        `PUBLISHED_VERSIONS.${slug}: ${version} is the version in ${file}, so it is the newest ` +
          `published one and goes last`
      );
    }
    if (legalTextFingerprint(current) !== inForce.sha256) {
      problems.push(
        `${file} changed, but version ${version} was published: a published text does not change ` +
          `under the same number (terms §18). Give the change a new version, and keep this one at ` +
          `${LEGAL_ARCHIVE_DIR}/${slug}/${version}.md — \`git show HEAD:${file}\` still has it`
      );
    }
  } else if (!isDraftLegalText(current)) {
    problems.push(
      `${file} is no longer a draft — nothing marks it „nepublicată" and no [[…]] is left — so ` +
        `version ${version} can reach families: add { version: "${version}", sha256: ` +
        `"${legalTextFingerprint(current)}" } at the end of PUBLISHED_VERSIONS.${slug}`
    );
  }

  for (const entry of published) {
    if (entry.version === version) continue;
    const where = `${LEGAL_ARCHIVE_DIR}/${slug}/${entry.version}.md`;
    const text = archived.get(entry.version);
    if (text === undefined) {
      problems.push(
        `${slug} ${entry.version} was published and is no longer the version in ${file}, so the ` +
          `families who accepted it must still be able to read it (terms §4.7): keep it, verbatim, ` +
          `at ${where}`
      );
    } else if (legalTextFingerprint(text) !== entry.sha256) {
      problems.push(
        `${where} is not the text published as ${entry.version}: the fingerprint differs`
      );
    }
  }

  for (const kept of archived.keys()) {
    if (!listed.has(kept)) {
      problems.push(
        `${LEGAL_ARCHIVE_DIR}/${slug}/${kept}.md is not a published version of ${slug}: the ` +
          `archive keeps what families accepted, and a draft would be served with its placeholders`
      );
    }
  }

  return problems;
}
