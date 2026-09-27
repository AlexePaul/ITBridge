import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { accountState } from "~/composables/useAccountState";

/**
 * A refused family can be approved again — review of 26 September 2026. The refusal mail says „ne
 * uităm încă o dată", the API always accepted it, and no screen offered it.
 */
const APPROVALS = readFileSync(
  new URL("../app/pages/admin/approvals/index.vue", import.meta.url),
  "utf8"
);
const FAMILY = readFileSync(
  new URL("../app/pages/admin/profiles/[profileId]/index.vue", import.meta.url),
  "utf8"
);

const account = (
  approvalStatus: "PENDING" | "APPROVED" | "REJECTED",
  emailConfirmed = true,
  suspendedAt: string | null = null
) => ({
  userId: 1,
  approvalStatus,
  approvalDecidedAt: "2026-09-20T10:00:00.000Z",
  emailConfirmed,
  viaClaim: false,
  suspendedAt,
  suspensionReason: suspendedAt ? "Contul a fost folosit de altcineva." : null,
});
const LOGIN = readFileSync(new URL("../app/pages/auth/login.vue", import.meta.url), "utf8");

describe("the account on the family page", () => {
  it("offers approval on a refused account, and on one still waiting", () => {
    expect(accountState(account("REJECTED"))).toMatchObject({
      label: "Cont respins",
      canApprove: true,
    });
    expect(accountState(account("PENDING")).canApprove).toBe(true);
  });

  it("offers nothing on an approved account, and says when the address is still unproven", () => {
    expect(accountState(account("APPROVED"))).toMatchObject({
      label: "Cont activ",
      canApprove: false,
    });
    expect(accountState(account("APPROVED", false)).label).toMatch(/email neconfirmat/);
  });

  it("names a family with no account as such", () => {
    expect(accountState(null)).toMatchObject({ label: "Fără cont", canApprove: false });
  });

  it("is what the page reads, and the page approves through the queue's own call", () => {
    expect(FAMILY).toMatch(/accountState\(profile\.value\?\.account\)/);
    expect(FAMILY).toMatch(/userApi\.approveAccount\(/);
  });
});

describe("the approvals screen", () => {
  it("lists the refused accounts with the day of the decision, and approves from there", () => {
    expect(APPROVALS).toMatch(/fetchRejectedAccounts\(\)/);
    expect(APPROVALS).toMatch(/Conturi respinse/);
    expect(APPROVALS).toMatch(/decidedOn\(account\.decidedAt\)/);
    expect(APPROVALS).toMatch(/onApproveRejected\(account\)/);
  });
});

/**
 * Terms §14: „Putem suspenda un cont folosit contrar regulilor […] și îl reactivăm când motivul
 * dispare." The page offers one thing at a time — a suspended account is lifted before anything
 * else is decided about it.
 */
describe("a suspended account", () => {
  it("offers only lifting the suspension, whatever the approval says", () => {
    for (const status of ["PENDING", "APPROVED", "REJECTED"] as const) {
      expect(accountState(account(status, true, "2026-09-26T10:00:00.000Z"))).toMatchObject({
        label: "Cont suspendat",
        canReactivate: true,
        canApprove: false,
        canSuspend: false,
      });
    }
  });

  it("can be suspended from any other state, and never offers lifting what is not there", () => {
    for (const status of ["PENDING", "APPROVED", "REJECTED"] as const) {
      expect(accountState(account(status))).toMatchObject({
        canSuspend: true,
        canReactivate: false,
      });
    }
    expect(accountState(null)).toMatchObject({ canSuspend: false, canReactivate: false });
  });

  it("is suspended from the family page with a reason, which the form says goes to the family", () => {
    expect(FAMILY).toMatch(/userApi\.suspendAccount\(current\.userId, reason\)/);
    expect(FAMILY).toMatch(/userApi\.reactivateAccount\(current\.userId\)/);
    expect(FAMILY).toMatch(/Pleacă în emailul către familie/);
  });

  it("is listed on the approvals screen, where the office lifts it", () => {
    expect(APPROVALS).toMatch(/fetchSuspendedAccounts\(\)/);
    expect(APPROVALS).toMatch(/Conturi suspendate/);
    expect(APPROVALS).toMatch(/onReactivate\(account\)/);
  });

  it("is told at the sign-in in its own words, not as a wrong password", () => {
    expect(LOGIN).toMatch(/code === "ACCOUNT_SUSPENDED"/);
    expect(LOGIN).toMatch(/apiErrorMessage\(error\)/);
  });
});
