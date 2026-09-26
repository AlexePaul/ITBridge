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

const account = (approvalStatus: "PENDING" | "APPROVED" | "REJECTED", emailConfirmed = true) => ({
  userId: 1,
  approvalStatus,
  approvalDecidedAt: "2026-09-20T10:00:00.000Z",
  emailConfirmed,
});

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
