import { describe, expect, it } from "vitest";
import { apiErrorMessage } from "../app/composables/useApiError";

/**
 * What an admin reads when a call fails.
 *
 * The order matters and each step earns its place, but the one worth a test of its own is the
 * last: a failure with no response at all. `ofetch` puts a synthesised string on `err.message` —
 * the method, the full URL and the browser's own English wording — and that used to be preferred
 * over the caller's `fallback`. So the most likely failure in a classroom, a connection that
 * drops, printed the internal API address into a Romanian-only interface on every admin screen.
 *
 * Found by pulling the plug on one endpoint in a real browser and reading the card, not by reading
 * the function: the screen did show an error with a working retry, which is all the earlier checks
 * asked of it.
 */
describe("apiErrorMessage", () => {
  it("shows the caller's sentence when the request never reached the API", () => {
    // Exactly what ofetch throws when the connection fails: a message, and no `data` at all.
    const transportError = Object.assign(
      new Error('[GET] "http://127.0.0.1:3000/groups": <no response> Failed to fetch'),
      { data: undefined }
    );

    const message = apiErrorMessage(transportError, "Nu am putut încărca grupele.");

    expect(message).toBe("Nu am putut încărca grupele.");
    expect(message).not.toContain("Failed to fetch");
    // The address of the API is not a thing a user is shown.
    expect(message).not.toContain("http");
  });

  it("falls back to its own Romanian sentence when the caller gives none", () => {
    const transportError = new Error("Failed to fetch");
    expect(apiErrorMessage(transportError)).toBe("A apărut o eroare. Încearcă din nou.");
  });

  it("prefers the field-level details, which name what is wrong", () => {
    const err = { data: { details: ["phone must be a valid phone number", "email is required"] } };
    expect(apiErrorMessage(err, "x")).toBe(
      "phone must be a valid phone number · email is required"
    );
  });

  it("maps a known code to its Romanian wording", () => {
    const err = { data: { code: "FORBIDDEN", message: "Forbidden resource" } };
    expect(apiErrorMessage(err, "x")).toBe("Nu ai dreptul să faci această operațiune.");
  });

  it("uses the body's message for a code it has no wording for", () => {
    const err = { data: { code: "SOMETHING_NEW", message: "se suprapune cu «Vacanța de iarnă»" } };
    expect(apiErrorMessage(err, "x")).toBe("se suprapune cu «Vacanța de iarnă»");
  });

  // E06 S1. A 500 used to print the body's English „Internal server error"; it says what happened
  // in Romanian now, with the code the error went under on /admin/erori.
  it("says a 5xx in Romanian, with the code a family can read out", () => {
    const err = {
      data: {
        statusCode: 500,
        code: "INTERNAL_ERROR",
        message: "Internal server error",
        requestId: "3f2a9c1d-0000-4000-8000-000000000000",
      },
    };
    expect(apiErrorMessage(err, "x")).toBe(
      "A apărut o eroare pe server. Încearcă din nou peste câteva momente. (cod 3f2a9c1d)"
    );
  });

  it("never shows the server's English for a 5xx it has no sentence for", () => {
    const err = {
      data: {
        statusCode: 502,
        code: "BAD_GATEWAY",
        message: "Bad Gateway",
        requestId: "abcd1234-x",
      },
    };
    expect(apiErrorMessage(err, "x")).toBe(
      "A apărut o eroare pe server. Încearcă din nou peste câteva momente. (cod abcd1234)"
    );
  });

  it("keeps a 5xx's own sentence when it has one", () => {
    const err = {
      data: { statusCode: 503, code: "FISCAL_PDF_UNAVAILABLE", requestId: "feedbeef-1" },
    };
    expect(apiErrorMessage(err, "x")).toMatch(
      /^SmartBill nu a trimis încă PDF-ul facturii.* \(cod feedbeef\)$/
    );
  });

  it("gives no code with a 4xx: the reader can act on it", () => {
    const err = { data: { statusCode: 409, code: "PROFILE_EMAIL_TAKEN", requestId: "3f2a9c1d-x" } };
    expect(apiErrorMessage(err, "x")).toBe("Adresa de email este deja trecută la altă familie.");
  });
});
