import type { ConfirmEmailResponse } from "~/types/auth.types";

export type ConfirmationOutcome = "confirmed" | "awaiting-approval" | "rejected";

/**
 * What the confirmation page says once the link worked — both gates, not only the first.
 *
 * It read `active` alone, so a family the school had refused, opening its link afterwards, was told
 * „Mai rămâne un pas… îți trimitem un email imediat ce e gata — de obicei în aceeași zi
 * lucrătoare" (review of 26 September 2026): a promise about a decision already taken the other
 * way, next to the refusal mail in the same inbox.
 */
export function confirmationOutcome(
  result: Pick<ConfirmEmailResponse, "active" | "approvalStatus">
): ConfirmationOutcome {
  if (result.active) return "confirmed";
  return result.approvalStatus === "REJECTED" ? "rejected" : "awaiting-approval";
}
