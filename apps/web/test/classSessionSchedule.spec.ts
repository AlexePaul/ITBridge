import { describe, expect, it } from "vitest";
import {
  countLabel,
  formatIsoDay,
  generatedScheduleMessage,
} from "~/composables/useClassSessionSchedule";
import type { GenerateClassSessionsResult } from "~/types/class-session.types";

/**
 * The sentence an admin reads after pressing "Generează orarul". It is the only part of the
 * feature that is pure, and the part most likely to come out wrong in Romanian: the number decides
 * the article, the plural and whether "de" belongs in front of the noun.
 */

const result = (
  overrides: Partial<GenerateClassSessionsResult> = {}
): GenerateClassSessionsResult => ({
  from: "2026-08-01",
  to: "2026-09-25",
  groups: 1,
  created: 12,
  existing: 0,
  sessions: [],
  ...overrides,
});

describe("countLabel", () => {
  it("uses the feminine article for one", () => {
    expect(countLabel(1, "ședință", "ședințe")).toBe("o ședință");
  });

  it("uses the bare plural below twenty", () => {
    expect(countLabel(3, "ședință", "ședințe")).toBe("3 ședințe");
    expect(countLabel(19, "ședință", "ședințe")).toBe("19 ședințe");
  });

  it("introduces the plural with 'de' from twenty up", () => {
    expect(countLabel(20, "ședință", "ședințe")).toBe("20 de ședințe");
    expect(countLabel(100, "grupă", "grupe")).toBe("100 de grupe");
  });

  // The rule restarts inside every hundred, which is the half everybody forgets.
  it("drops 'de' again when the last two digits fall back under twenty", () => {
    expect(countLabel(101, "ședință", "ședințe")).toBe("101 ședințe");
    expect(countLabel(119, "ședință", "ședințe")).toBe("119 ședințe");
    expect(countLabel(120, "ședință", "ședințe")).toBe("120 de ședințe");
  });
});

describe("formatIsoDay", () => {
  it("keeps the day the API sent, in every timezone", () => {
    // `new Date("2026-09-25")` is UTC midnight, which is the 24th anywhere west of Greenwich.
    expect(formatIsoDay("2026-09-25")).toBe("25 septembrie 2026");
  });

  it("hands back anything that is not a date rather than printing 'Invalid Date'", () => {
    expect(formatIsoDay("nu-e-o-dată")).toBe("nu-e-o-dată");
    expect(formatIsoDay("2026-09")).toBe("2026-09");
  });
});

describe("generatedScheduleMessage", () => {
  it("says how many classes were written and until when", () => {
    expect(generatedScheduleMessage(result())).toBe(
      "Am generat 12 ședințe, până pe 25 septembrie 2026."
    );
  });

  it("names the group count only when the run covered more than one", () => {
    expect(generatedScheduleMessage(result({ groups: 6, created: 48 }))).toBe(
      "Am generat 48 de ședințe pentru 6 grupe, până pe 25 septembrie 2026."
    );
  });

  // The reassurance that makes a second press safe to try.
  it("reports a second run as a no-op instead of an error", () => {
    expect(generatedScheduleMessage(result({ created: 0, existing: 12 }))).toBe(
      "Orarul era deja complet, până pe 25 septembrie 2026. Nu s-a adăugat nimic."
    );
  });

  it("agrees the verb with a single pre-existing class", () => {
    expect(generatedScheduleMessage(result({ created: 2, existing: 1 }))).toBe(
      "Am generat 2 ședințe, până pe 25 septembrie 2026. O ședință exista deja."
    );
  });

  it("mentions the ones that were already there", () => {
    expect(generatedScheduleMessage(result({ created: 4, existing: 8 }))).toBe(
      "Am generat 4 ședințe, până pe 25 septembrie 2026. 8 ședințe existau deja."
    );
  });

  // The state a fresh school is in: the groups page offers the button before any group exists.
  it("says there is no active group rather than counting to zero", () => {
    expect(generatedScheduleMessage(result({ groups: 0, created: 0, existing: 0 }))).toBe(
      "Nicio grupă activă, deci nu era nimic de generat."
    );
  });

  it("has something to say when the horizon was empty", () => {
    expect(generatedScheduleMessage(result({ created: 0, existing: 0 }))).toBe(
      "Nu era nimic de generat până pe 25 septembrie 2026."
    );
  });
});
