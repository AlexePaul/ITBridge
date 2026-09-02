import { describe, expect, it } from "vitest";
import { paymentDraftFor } from "../app/composables/usePaymentDraft";
import type { ArrearsRow } from "@itbridge/types";

const row = (over: Partial<ArrearsRow> = {}): ArrearsRow => ({
  invoiceId: 7,
  parentId: 3,
  parentName: "Ana Ionescu",
  email: "ana@example.com",
  phone: "+40712345678",
  monthIssued: "2026-03",
  dateIssued: "2026-03-01",
  dueOn: "2026-03-15",
  amount: 350,
  paid: 0,
  outstanding: 350,
  daysOverdue: 0,
  bucket: "due_soon",
  ...over,
});

describe("paymentDraftFor", () => {
  it("prefills the whole sum when nothing has been paid", () => {
    expect(paymentDraftFor(row(), "2026-03-20").amount).toBe(350);
  });

  it("prefills what is left, not the invoice total", () => {
    const draft = paymentDraftFor(row({ amount: 350, paid: 200, outstanding: 150 }), "2026-03-20");
    expect(draft.amount).toBe(150);
  });

  it("records against the invoice the row came from", () => {
    expect(paymentDraftFor(row({ invoiceId: 42 }), "2026-03-20").invoiceId).toBe(42);
  });

  it("defaults to cash on the day given, with the free-text fields empty", () => {
    const draft = paymentDraftFor(row(), "2026-03-20");
    expect(draft.method).toBe("cash");
    expect(draft.date).toBe("2026-03-20");
    expect(draft.externalReference).toBe("");
    expect(draft.notes).toBe("");
  });
});
