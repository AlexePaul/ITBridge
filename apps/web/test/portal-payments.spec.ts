import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { familyDiscountValue } from "~/types/discount.types";

/**
 * Plăți și facturi — what terms §11.3 and §11.4 promise the family can read there: where a transfer
 * goes, and the discounts the school gave.
 */
const PAYMENTS = readFileSync(new URL("../app/pages/user/payments.vue", import.meta.url), "utf8");

describe("the family's discounts", () => {
  it("reads as the family would say it, with a Romanian comma", () => {
    expect(familyDiscountValue(50, "percent")).toBe("−50%");
    expect(familyDiscountValue(12.5, "percent")).toBe("−12,5%");
    expect(familyDiscountValue(100, "fixed")).toBe("−100 lei");
    expect(familyDiscountValue(87.5, "fixed")).toBe("−87,50 lei");
  });

  it("are listed on the payments page, from the family's own route", () => {
    expect(PAYMENTS).toContain("Reducerile tale");
    expect(PAYMENTS).toContain("discountsApi.fetchFamilyDiscounts()");
  });
});

describe("how to pay", () => {
  it("prints the school's account only when the server has one", () => {
    expect(PAYMENTS).toMatch(/<template v-if="transfer">[\s\S]*transfer\.iban[\s\S]*<\/template>/);
    expect(PAYMENTS).toContain("Datele contului pentru transfer ți le dăm");
  });

  /** Furniture around the invoices: a failed read must not take the invoices down with it. */
  it("never lets the details or the discounts fail the page", () => {
    expect(PAYMENTS).toContain("discountsApi.fetchFamilyDiscounts().catch(() => [])");
    expect(PAYMENTS).toContain(
      "invoiceApi.fetchPaymentDetails().catch(() => ({ transfer: null }))"
    );
  });
});
