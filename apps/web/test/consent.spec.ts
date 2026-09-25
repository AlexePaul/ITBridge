import { describe, expect, it } from "vitest";
import { consentFor, consentSummary, creditLine } from "../app/composables/useConsent";
import type { ChildConsents, PurposeConsent } from "../app/types/consent.types";

const base: PurposeConsent = {
  purpose: "promotion",
  currentVersion: "0.1",
  inForce: null,
  history: [],
};

// Noon UTC keeps the day the same in every zone a test machine could be in.
const record = (overrides: Partial<NonNullable<PurposeConsent["inForce"]>> = {}) => ({
  id: 1,
  purpose: "promotion" as const,
  textVersion: "0.1",
  grantedAt: "2026-09-01T12:00:00.000Z",
  grantedVia: "portal" as const,
  revokedAt: null,
  revokedVia: null,
  ...overrides,
});

describe("consentSummary", () => {
  it("says when, how and under which text a consent in force was given", () => {
    const given = record();

    expect(consentSummary({ ...base, inForce: given, history: [given] })).toBe(
      "Acord dat pe 1 sept. 2026, din portal · versiunea 0.1"
    );
  });

  it("names the office when the office wrote it down", () => {
    const given = record({ grantedVia: "office" });

    expect(consentSummary({ ...base, inForce: given, history: [given] })).toContain(
      "consemnat de birou"
    );
  });

  it("tells a withdrawn consent apart from one never given", () => {
    const withdrawn = record({ revokedAt: "2026-09-20T12:00:00.000Z", revokedVia: "portal" });

    expect(consentSummary({ ...base, history: [withdrawn] })).toBe(
      "Acord retras pe 20 sept. 2026, din portal. Nu folosim lucrările."
    );
    expect(consentSummary(base)).toBe("Fără acord. Nu folosim lucrările.");
  });
});

describe("consentFor", () => {
  it("finds the purpose, and answers 'no consent' if the server never sent it", () => {
    const child: ChildConsents = {
      childId: 3,
      firstName: "Matei",
      lastName: "Pop",
      purposes: [{ ...base, inForce: record(), history: [record()] }],
    };

    expect(consentFor(child, "promotion").inForce?.id).toBe(1);
    expect(consentFor({ ...child, purposes: [] }, "promotion").inForce).toBeNull();
  });
});

describe("creditLine", () => {
  const ana = { firstName: "Ana", lastName: "popescu", birthDate: "2017-03-16" };

  it("prints first name, initial and age, and nothing more", () => {
    expect(creditLine(ana, "2026-09-25")).toBe("Ana P., 9 ani");
  });

  it("counts the birthday itself as the day the age turns", () => {
    expect(creditLine(ana, "2026-03-15")).toBe("Ana P., 8 ani");
    expect(creditLine(ana, "2026-03-16")).toBe("Ana P., 9 ani");
  });

  it("says one year in the singular", () => {
    expect(creditLine({ ...ana, birthDate: "2025-01-01" }, "2026-01-01")).toBe("Ana P., 1 an");
  });
});
