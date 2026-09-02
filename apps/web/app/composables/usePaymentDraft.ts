import type { ArrearsRow } from "~/types/arrears.types";
import type { PaymentMethod } from "~/types/payment.types";

export interface PaymentDraft {
  invoiceId: number;
  amount: number;
  method: PaymentMethod;
  date: string;
  externalReference: string;
  notes: string;
}

/**
 * What the receipt form starts filled in with — E16/S5.
 *
 * **The sum is what is left, never the invoice total.** The screen this replaces prefilled the
 * total, so a family who had paid 200 of 350 and now paid the remaining 150 had 350 typed for
 * them; one Enter later the register held 550 received against a 350 invoice. The number comes
 * from the arrears row, where it was computed once, rather than being worked out again here.
 *
 * Cash by default because most of it is cash, and today's date because a receipt is written when
 * the money arrives. Both are one keystroke from the alternative, which is the right cost for a
 * default that is usually right.
 *
 * A pure function so the rule can be asserted without mounting anything — the amount is the line
 * that was wrong before, and it is worth a test that names it.
 */
export function paymentDraftFor(row: ArrearsRow, today: string): PaymentDraft {
  return {
    invoiceId: row.invoiceId,
    amount: row.outstanding,
    method: "cash",
    date: today,
    externalReference: "",
    notes: "",
  };
}
