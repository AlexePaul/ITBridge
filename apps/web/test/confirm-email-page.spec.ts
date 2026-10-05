import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { confirmationOutcome, confirmationRefusal } from "~/composables/useConfirmationOutcome";
import { apiErrorMessage } from "~/composables/useApiError";

/**
 * The confirmation page said two untrue things (review of 26 September 2026): to a family the school
 * had refused, that approval was a working day away; and, for a used link whose address had since
 * been replaced, that the address was confirmed — the server now answers that case as superseded.
 */
const PAGE = readFileSync(new URL("../app/pages/auth/confirm-email.vue", import.meta.url), "utf8");

describe("the confirmation page", () => {
  it("does not promise approval to a family the school has refused", () => {
    expect(confirmationOutcome({ active: false, approvalStatus: "REJECTED" })).toBe("rejected");
    expect(confirmationOutcome({ active: false, approvalStatus: "PENDING" })).toBe(
      "awaiting-approval"
    );
    expect(confirmationOutcome({ active: true, approvalStatus: "APPROVED" })).toBe("confirmed");
  });

  it("tells the refused family how to ask again, not how long to wait", () => {
    const rejected = /state === 'rejected'"[\s\S]*?<\/template>/.exec(PAGE)?.[0] ?? "";
    expect(rejected).toMatch(/nu a fost activat/);
    expect(rejected).toMatch(/ne uităm încă o\s+dată/);
    expect(rejected).not.toMatch(/aceeași zi lucrătoare/);
  });

  /**
   * A second use of the link said „Linkul a fost deja folosit — adresa ta este confirmată" and,
   * under it, „Dacă linkul a expirat, autentifică-te…" (QA of 27 September 2026). The refusal carries
   * no approval state, so the page cannot say what is left the way the first use does: it says the
   * address is confirmed and sends the family to sign in, where the account shows the rest.
   */
  it("answers a used link with the confirmed address and the way to see what is left", () => {
    expect(confirmationRefusal("CONFIRMATION_TOKEN_USED")).toBe("used");
    const used = /state === 'used'"[\s\S]*?<\/template>/.exec(PAGE)?.[0] ?? "";
    expect(used).toMatch(/adresa ta este confirmată/);
    expect(used).toMatch(/Autentifică-te/);
    expect(used).toMatch(/aprob/);
    expect(used).not.toMatch(/expirat/);
  });

  it("gives the hint about asking for a new link to an expired link alone", () => {
    expect(confirmationRefusal("CONFIRMATION_TOKEN_EXPIRED")).toBe("expired");
    expect(confirmationRefusal("CONFIRMATION_TOKEN_INVALID")).toBe("failed");
    expect(confirmationRefusal("CONFIRMATION_TOKEN_SUPERSEDED")).toBe("failed");
    expect(confirmationRefusal(undefined)).toBe("failed");

    const expired = /state === 'expired'"[\s\S]*?<\/template>/.exec(PAGE)?.[0] ?? "";
    expect(expired).toMatch(/Retrimite linkul/);
    expect(PAGE.replace(expired, "")).not.toMatch(/linkul a expirat/i);
  });

  /** QA of 27 September 2026: a parent signed in in this browser was offered "Autentifică-te". */
  it("sends a parent who is signed in to their account, not to the sign-in form", () => {
    expect(PAGE).toMatch(/"\/user\/dashboard", label: "Mergi la contul tău"/);
    for (const state of ["confirmed", "used", "expired"]) {
      const block =
        new RegExp(`state === '${state}'"[\\s\\S]*?<\\/template>`).exec(PAGE)?.[0] ?? "";
      expect(block).toMatch(/:to="nextStep\.to"/);
      expect(block).not.toMatch(/to="\/auth\/login"/);
    }
  });

  it("says a used link confirmed the address only when the server says it still does", () => {
    const superseded = { data: { code: "CONFIRMATION_TOKEN_SUPERSEDED" } };
    expect(apiErrorMessage(superseded)).not.toMatch(/este confirmată/);
    expect(apiErrorMessage(superseded)).toMatch(/adresa nouă/);
  });
});
