import { describe, expect, it } from "vitest";
import { decodeStatement, readStatementFile } from "~/composables/useStatementFile";
import { describeUnreadableRow } from "~/types/reconciliation.types";

/**
 * The bank statement as the browser reads it — QA of 26 September 2026. `File.text()` is UTF-8
 * only, and a Windows-1250 export lost its header and its payers' names to replacement characters.
 */
describe("decodeStatement", () => {
  // "Dată;Sumă;Detalii\n05.11.2026;350,00;POPESCU ŞTEFĂNIŢĂ" as Windows-1250 writes it:
  // ă = E3, Ş = AA, Ţ = DE, Ă = C3 — none of them a valid UTF-8 sequence on its own.
  const cp1250 = new Uint8Array([
    ...Buffer.from("Dat"),
    0xe3,
    ...Buffer.from(";Sum"),
    0xe3,
    ...Buffer.from(";Detalii\n05.11.2026;350,00;POPESCU "),
    0xaa,
    ...Buffer.from("TEF"),
    0xc3,
    ...Buffer.from("NI"),
    0xde,
    0xc3,
  ]);

  it("reads a Windows-1250 export with its diacritics", () => {
    expect(decodeStatement(cp1250)).toBe("Dată;Sumă;Detalii\n05.11.2026;350,00;POPESCU ŞTEFĂNIŢĂ");
  });

  it("reads UTF-8 as UTF-8, byte order mark and all", () => {
    const utf8 = new Uint8Array([0xef, 0xbb, 0xbf, ...Buffer.from("Dată;Sumă\n05.11.2026;350,00")]);
    expect(decodeStatement(utf8)).toBe("Dată;Sumă\n05.11.2026;350,00");
  });

  it("reads a file the way the page does", async () => {
    await expect(readStatementFile(new Blob([cp1250]))).resolves.toContain("ŞTEFĂNIŢĂ");
  });
});

describe("describeUnreadableRow", () => {
  it("says each problem in Romanian, quoting the cell it could not read", () => {
    expect(describeUnreadableRow("unreadable_date", "Total rulaje")).toBe(
      "„Total rulaje” nu e o dată"
    );
    expect(describeUnreadableRow("no_date", null)).toContain("total");
    expect(describeUnreadableRow("no_amount", "05.11.2026")).toContain("sumă");
  });
});
