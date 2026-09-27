import { describe, expect, it } from "vitest";
import { describeSendFailure } from "~/types/delivery.types";

/**
 * /admin/livrari printed the provider's raw text as the reason a message failed — „Provider
 * responded 421: try again later" (QA of 27 September 2026). The office reads a Romanian sentence
 * for each shape `apps/api/src/modules/mail/mail.service.ts` writes into `lastError`; the raw text
 * stays on the row, smaller, for whoever debugs it.
 */
describe("describeSendFailure", () => {
  it("says the server is not set up to send, when that is why", () => {
    expect(
      describeSendFailure(
        "Mail is not configured: MAIL_RESEND_API_KEY and MAIL_FROM is not set. Nothing was sent."
      )
    ).toBe(
      "Serverul nu are încă setările de trimitere a emailurilor, deci nu s-a trimis nimic. Mesajul pleacă singur după ce se configurează."
    );
  });

  it("says the provider could not be reached", () => {
    expect(
      describeSendFailure("Resend could not be reached: The operation was aborted due to timeout")
    ).toBe(
      "Furnizorul de email n-a putut fi contactat — rețeaua sau un timp de așteptare depășit."
    );
  });

  it.each([
    [
      '{"statusCode":422,"name":"validation_error","message":"Invalid `to` field."}',
      422,
      "Furnizorul de email a refuzat mesajul ca invalid — de obicei, o adresă de email greșită.",
    ],
    [
      "{}",
      400,
      "Furnizorul de email a refuzat mesajul ca invalid — de obicei, o adresă de email greșită.",
    ],
    ["Invalid API key", 401, "Furnizorul de email n-a acceptat cheia de trimitere a serverului."],
    [
      "The itbridgeschool.com domain is not verified",
      403,
      "Furnizorul de email a refuzat trimiterea — de obicei, domeniul expeditorului nu e verificat.",
    ],
    ["{}", 408, "Furnizorul de email n-a răspuns la timp."],
    ["rate limited", 429, "Furnizorul de email a cerut o pauză: prea multe mesaje deodată."],
    ["{}", 503, "Furnizorul de email a avut o problemă de partea lui (cod 503)."],
    ["{}", 409, "Furnizorul de email a refuzat mesajul (cod 409)."],
  ])("names what the provider's %s (HTTP %i) means", (detail, status, sentence) => {
    expect(describeSendFailure(`Resend answered ${status}: ${detail}`)).toBe(sentence);
  });

  // A shape nobody wrote here — an older row, a seed — is not guessed at: it is a failure, and the
  // raw text beside it says the rest.
  it("says only that it failed when the text is not one it knows", () => {
    expect(describeSendFailure("Provider responded 421: try again later")).toBe(
      "Trimiterea a eșuat."
    );
  });
});
