import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { confirmationOutcome } from "~/composables/useConfirmationOutcome";
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

  it("says a used link confirmed the address only when the server says it still does", () => {
    const superseded = { data: { code: "CONFIRMATION_TOKEN_SUPERSEDED" } };
    expect(apiErrorMessage(superseded)).not.toMatch(/este confirmată/);
    expect(apiErrorMessage(superseded)).toMatch(/adresa nouă/);
  });
});
