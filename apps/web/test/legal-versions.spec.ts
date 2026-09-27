import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  LEGAL_ARCHIVE_DIR,
  isDraftLegalText,
  legalArchiveProblems,
  legalTextFingerprint,
  type LegalArchiveState,
} from "../server/utils/legal-archive";
import {
  LEGAL_DOCUMENTS,
  PUBLISHED_VERSIONS,
  VERSIONED_DOCUMENTS,
  supersededTextPath,
  type PublishedVersion,
} from "../shared/legal";
import { consentTextPath } from "../app/composables/useConsent";
import type { PurposeConsent } from "../app/types/consent.types";

/**
 * Terms §4.7: the version a family accepted „o poți reciti oricând din portal" — `docs/legal/README.md`,
 * item 10.
 *
 * The promise breaks in exactly one change, the one that replaces a text families accepted, and
 * nothing in that diff shows the family who looks for the old text a year later. So the procedure
 * is this gate rather than a paragraph: the rules are held against invented histories below, and
 * then against the repository's own.
 */

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

const DRAFT = [
  "# Termeni și condiții",
  "",
  "**Versiunea 0.2 · ciornă din 26 septembrie 2026 · neverificată de un avocat · nepublicată.**",
  "",
  "Firma [[DENUMIRE]], cu sediul în [[SEDIU]].",
  "",
].join("\n");

const V1 = [
  "# Termeni și condiții",
  "",
  "**Versiunea 1.0 · în vigoare din 1 octombrie 2026.**",
  "",
  "## 1. Contul",
  "",
  "Contul e al părintelui, nu al copilului.",
  "",
  "| Ce       | Cât    |",
  "| -------- | ------ |",
  "| Ședința  | 87,50  |",
  "",
].join("\n");

const V1_1 = V1.replace(
  "Versiunea 1.0 · în vigoare din 1 octombrie 2026",
  "Versiunea 1.1 · în vigoare din 1 martie 2027"
).replace(
  "Contul e al părintelui, nu al copilului.",
  "Contul e al părintelui, nu al copilului. Un al doilea părinte are cont propriu."
);

const published = (...texts: string[]): PublishedVersion[] =>
  texts.map((text) => ({
    version: /\*\*Versiunea (\d+\.\d+)/.exec(text)?.[1] ?? "",
    sha256: legalTextFingerprint(text),
  }));

const problems = (overrides: Partial<LegalArchiveState>): string[] =>
  legalArchiveProblems({
    slug: "termeni",
    file: "docs/legal/termeni-si-conditii.md",
    current: V1,
    published: [],
    archived: new Map(),
    ...overrides,
  });

describe("what counts as a draft", () => {
  it("is a text still marked unpublished on its first line, or with a placeholder in it", () => {
    expect(isDraftLegalText(DRAFT)).toBe(true);
    expect(isDraftLegalText(DRAFT.replace(/\[\[[A-Z]+\]\]/g, "IT Bridge SRL"))).toBe(true);
    expect(isDraftLegalText(V1.replace("Contul", "Contul [[DE CONFIRMAT]]"))).toBe(true);
    expect(isDraftLegalText(V1)).toBe(false);
  });
});

describe("the fingerprint", () => {
  it("is the text a reader reads, so reformatting the Markdown does not move it", () => {
    const reformatted = V1.replace("| Ce       | Cât    |", "| Ce | Cât |")
      .replace("| -------- | ------ |", "| --- | --- |")
      .replace("| Ședința  | 87,50  |", "| Ședința | 87,50 |")
      .replace(/\n/g, "\r\n");

    expect(legalTextFingerprint(reformatted)).toBe(legalTextFingerprint(V1));
  });

  it("moves with a single word", () => {
    expect(legalTextFingerprint(V1.replace("părintelui", "familiei"))).not.toBe(
      legalTextFingerprint(V1)
    );
  });
});

describe("the archive's rules", () => {
  it("ask nothing of a draft — it was never in front of a family", () => {
    expect(problems({ current: DRAFT })).toEqual([]);
  });

  it("ask for a text that is no longer a draft to be recorded, with the fingerprint to paste", () => {
    const found = problems({ current: V1 });

    expect(found).toHaveLength(1);
    expect(found[0]).toContain('version: "1.0"');
    expect(found[0]).toContain(legalTextFingerprint(V1));
  });

  it("are satisfied by a published text left as it was", () => {
    expect(problems({ current: V1, published: published(V1) })).toEqual([]);
  });

  it("refuse a published text changed under the same number — terms §18", () => {
    const edited = V1.replace("nu al copilului", "nu al copilului sau al bunicilor");
    const found = problems({ current: edited, published: published(V1) });

    expect(found).toHaveLength(1);
    expect(found[0]).toContain("does not change under the same number");
    expect(found[0]).toContain("git show HEAD:docs/legal/termeni-si-conditii.md");
  });

  it("ask for the replaced version to be kept, and the new one recorded", () => {
    const found = problems({ current: V1_1, published: published(V1) });

    expect(found.some((line) => line.includes('version: "1.1"'))).toBe(true);
    expect(
      found.some(
        (line) => line.includes(`${LEGAL_ARCHIVE_DIR}/termeni/1.0.md`) && line.includes("§4.7")
      )
    ).toBe(true);
  });

  it("are satisfied once the replaced text is kept verbatim and the new one recorded", () => {
    expect(
      problems({ current: V1_1, published: published(V1, V1_1), archived: new Map([["1.0", V1]]) })
    ).toEqual([]);
  });

  it("ask for the replaced text even while its successor is still a draft", () => {
    const nextDraft = V1_1.replace("Un al doilea", "[[DE DECIS]] Un al doilea");
    const found = problems({ current: nextDraft, published: published(V1) });

    expect(found).toHaveLength(1);
    expect(found[0]).toContain(`${LEGAL_ARCHIVE_DIR}/termeni/1.0.md`);
  });

  it("refuse a kept text that is not the one published", () => {
    const found = problems({
      current: V1_1,
      published: published(V1, V1_1),
      archived: new Map([["1.0", V1.replace("părintelui", "familiei")]]),
    });

    expect(found).toEqual([
      `${LEGAL_ARCHIVE_DIR}/termeni/1.0.md is not the text published as 1.0: the fingerprint differs`,
    ]);
  });

  it("refuse a draft in the archive — it would be served with its placeholders", () => {
    const found = problems({
      current: V1,
      published: published(V1),
      archived: new Map([["0.2", DRAFT]]),
    });

    expect(found).toHaveLength(1);
    expect(found[0]).toContain("0.2.md is not a published version");
  });

  it("keep the version in force last, and every version once", () => {
    // A file put back to 1.0 after 1.1 was published: the list says 1.1 is the newer text.
    expect(
      problems({ current: V1, published: [...published(V1), ...published(V1_1)] })
    ).toContainEqual(expect.stringContaining("goes last"));
    expect(
      problems({ current: V1, published: [...published(V1), ...published(V1)] })
    ).toContainEqual(expect.stringContaining("lists 1.0 twice"));
  });

  it("ask for a version line before anything else", () => {
    expect(problems({ current: "# Termeni\n\nText.\n" })).toEqual([
      'docs/legal/termeni-si-conditii.md has no "**Versiunea X.Y" line, so nothing can record which text was accepted',
    ]);
  });
});

describe("the repository keeps the promise", () => {
  const archiveDir = `${repoRoot}${LEGAL_ARCHIVE_DIR}`;

  /** The kept texts of a document, by the version their file is named after. */
  const keptTexts = (slug: string): Map<string, string> => {
    const dir = `${archiveDir}/${slug}`;
    if (!existsSync(dir)) return new Map();
    return new Map(
      readdirSync(dir)
        .filter((name) => name.endsWith(".md"))
        .map((name) => [name.slice(0, -".md".length), readFileSync(`${dir}/${name}`, "utf8")])
    );
  };

  for (const slug of VERSIONED_DOCUMENTS) {
    it(`${slug}: every published version stays readable, and none changes under its number`, () => {
      const file = `docs/legal/${LEGAL_DOCUMENTS[slug].file}`;

      expect(
        legalArchiveProblems({
          slug,
          file,
          current: readFileSync(`${repoRoot}${file}`, "utf8"),
          published: PUBLISHED_VERSIONS[slug],
          archived: keptTexts(slug),
        })
      ).toEqual([]);
    });
  }

  it("keeps folders only for the documents a family accepts", () => {
    const folders = readdirSync(archiveDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);

    for (const folder of folders) {
      expect(VERSIONED_DOCUMENTS as readonly string[]).toContain(folder);
    }
  });
});

describe("the links to a replaced version", () => {
  const publishedTerms = {
    termeni: published(V1, V1_1),
    confidentialitate: [],
    "acord-lucrari": [],
  };

  it("go to the kept text of a published version", () => {
    expect(supersededTextPath("termeni", "1.0", publishedTerms)).toBe("/versiuni/termeni/1.0");
  });

  it("go nowhere for a draft nobody published — there is no text to keep", () => {
    expect(supersededTextPath("termeni", "0.2", publishedTerms)).toBeNull();
    expect(supersededTextPath("confidentialitate", "1.0", publishedTerms)).toBeNull();
  });

  const consent = (textVersion: string | null, currentVersion = "1.1"): PurposeConsent => ({
    purpose: "promotion",
    currentVersion,
    inForce:
      textVersion === null
        ? null
        : {
            id: 1,
            purpose: "promotion",
            textVersion,
            grantedAt: "2026-10-02T09:00:00.000Z",
            grantedVia: "portal",
            revokedAt: null,
            revokedVia: null,
          },
    history: [],
  });

  it("from a consent, only once the text it was given under has been replaced", () => {
    const publishedConsent = {
      termeni: [],
      confidentialitate: [],
      "acord-lucrari": [
        { version: "1.0", sha256: "a".repeat(64) },
        { version: "1.1", sha256: "b".repeat(64) },
      ],
    };

    expect(consentTextPath(consent("1.0"), publishedConsent)).toBe("/versiuni/acord-lucrari/1.0");
    expect(consentTextPath(consent("1.1"), publishedConsent)).toBeNull();
    expect(consentTextPath(consent(null), publishedConsent)).toBeNull();
    expect(consentTextPath(consent("0.1"), publishedConsent)).toBeNull();
  });
});
