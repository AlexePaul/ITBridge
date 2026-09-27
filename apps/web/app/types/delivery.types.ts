export type {
  DeliveryRecord,
  DeliveryStatus,
  DeliverySummary,
  DeliveryLogFilter,
  DeliveryFailureReason,
} from "@itbridge/types";

import type { DeliveryFailureReason, DeliveryStatus } from "@itbridge/types";

/** Romanian labels for the delivery record — E17/S5. Next to the screen, per the standing rule. */
export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  pending: "În așteptare",
  sent: "Trimis",
  failed: "Eșuat",
  undeliverable: "Nelivrabil",
};

export const DELIVERY_STATUS_COLORS: Record<
  DeliveryStatus,
  "info" | "success" | "error" | "warning"
> = {
  pending: "info",
  sent: "success",
  failed: "error",
  undeliverable: "warning",
};

/**
 * The two reasons, and — the point of keeping them apart — what to do about each. They look
 * identical in a list; one needs a phone call, the other a resent link.
 */
export const UNDELIVERABLE_REASON_LABELS: Record<DeliveryFailureReason, string> = {
  no_address: "Fără adresă",
  unconfirmed_address: "Adresă neconfirmată",
};

export const UNDELIVERABLE_REASON_ACTIONS: Record<DeliveryFailureReason, string> = {
  no_address: "Sună familia și completează adresa în profil.",
  unconfirmed_address: "Retrimite linkul de confirmare din contul părintelui.",
};

/**
 * Why a send failed, in the office's words — from `lastError`, the text the API writes on the row.
 *
 * The API has no structured field for it: the row keeps the sentence `MailService` threw, whose
 * three shapes are pinned by its spec (`mail.service.spec.ts`, "writes its failures in the shapes the
 * delivery screen reads") — not configured, provider unreachable, and „Resend answered <HTTP
 * status>: <what it said>". /admin/livrari printed that text as it came (QA of 27 September 2026);
 * it now prints this, with the raw text kept beside it, smaller, for whoever debugs.
 *
 * Nothing is guessed from a shape not listed here: an older row or a hand-written one reads as a
 * failure, and the raw text says the rest.
 */
export function describeSendFailure(lastError: string): string {
  if (lastError.startsWith("Mail is not configured:")) {
    return "Serverul nu are încă setările de trimitere a emailurilor, deci nu s-a trimis nimic. Mesajul pleacă singur după ce se configurează.";
  }
  if (lastError.startsWith("Resend could not be reached:")) {
    return "Furnizorul de email n-a putut fi contactat — rețeaua sau un timp de așteptare depășit.";
  }
  const answered = /^Resend answered (\d{3}):/.exec(lastError);
  if (!answered) return "Trimiterea a eșuat.";
  const status = Number(answered[1]);
  switch (status) {
    case 400:
    case 422:
      return "Furnizorul de email a refuzat mesajul ca invalid — de obicei, o adresă de email greșită.";
    case 401:
      return "Furnizorul de email n-a acceptat cheia de trimitere a serverului.";
    case 403:
      return "Furnizorul de email a refuzat trimiterea — de obicei, domeniul expeditorului nu e verificat.";
    case 408:
      return "Furnizorul de email n-a răspuns la timp.";
    case 429:
      return "Furnizorul de email a cerut o pauză: prea multe mesaje deodată.";
  }
  return status >= 500
    ? `Furnizorul de email a avut o problemă de partea lui (cod ${status}).`
    : `Furnizorul de email a refuzat mesajul (cod ${status}).`;
}
