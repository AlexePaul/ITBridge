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

export type ConfirmationRefusal = "used" | "expired" | "failed";

/**
 * What the page says when the link confirmed nothing — QA of 27 September 2026.
 *
 * A second use of the link read „Linkul a fost deja folosit — adresa ta este confirmată", with the
 * hint about asking for a new link under it: a sentence for another case. The refusal carries no
 * approval state (it is an error body: a code and a message), so a used link cannot say what is
 * left the way the first use does. It says the address is confirmed and sends the family to sign
 * in, where the account shows whether the school's approval is still to come. The hint about a new
 * link is for an expired one alone; every other refusal says its own sentence and nothing more.
 */
export function confirmationRefusal(code: string | undefined): ConfirmationRefusal {
  if (code === "CONFIRMATION_TOKEN_USED") return "used";
  if (code === "CONFIRMATION_TOKEN_EXPIRED") return "expired";
  return "failed";
}
