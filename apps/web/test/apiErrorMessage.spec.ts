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
});
