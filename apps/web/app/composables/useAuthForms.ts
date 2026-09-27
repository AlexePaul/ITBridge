import * as z from "zod";
import { apiErrorCode, apiErrorMessage } from "~/composables/useApiError";

/**
 * The shortest new password the platform takes — the server's `MIN_PASSWORD_LENGTH`, enforced the
 * same by registration, the reset link and "change password". One number, in one place on this
 * side too: the register form used to demand eight while the other two screens took six.
 */
export const MIN_PASSWORD_LENGTH = 6;

const username = z
  .string("Numele de utilizator este obligatoriu")
  // A phone keyboard adds a space after an autocompleted word; the server trims too.
  .trim()
  .min(1, "Numele de utilizator este obligatoriu")
  .max(30, "Numele de utilizator poate avea cel mult 30 de caractere");

/**
 * Signing in checks that something was typed, and nothing more. A login form that applies a
 * password policy refuses passwords the server accepted — and it did: it demanded eight characters
 * while every screen that sets a password took six, so a family that reset to "parola1" could not
 * sign in again (QA of 26 September 2026).
 */
export const loginSchema = z.object({
  username,
  password: z.string("Parola este obligatorie").min(1, "Parola este obligatorie"),
});

/**
 * The register form's own fields, mirroring `RegisterDto` (E11/S2) — checked here so the message
 * sits under the field the reader can see. The server stays the authority.
 */
export const registrationSchema = z.object({
  username,
  password: z
    .string("Parola este obligatorie")
    .min(MIN_PASSWORD_LENGTH, `Parola trebuie să aibă cel puțin ${MIN_PASSWORD_LENGTH} caractere`),
  firstName: z
    .string()
    .trim()
    .min(1, "Prenumele este obligatoriu")
    .max(100, "Prenumele poate avea cel mult 100 de caractere"),
  lastName: z
    .string()
    .trim()
    .min(1, "Numele este obligatoriu")
    .max(100, "Numele poate avea cel mult 100 de caractere"),
  email: z
    .string()
    .trim()
    .min(1, "Adresa de email este obligatorie")
    .max(255, "Adresa de email poate avea cel mult 255 de caractere")
    .email("Adresa de email nu pare validă"),
  acceptedTerms: z.literal(true, "Bifează că ai citit termenii și politica de confidențialitate"),
  acceptedUnusualClauses: z.literal(true, "Bifează că accepți clauzele din §14, §15 și §18"),
});

/**
 * The page a family the office typed in reaches from its mail — `/auth/cont-familie` (E11 S2): the
 * registration's own rules for what an account needs, without the name and the address, which the
 * office already holds. Picked from the schema above rather than written again, so the two doors
 * into an account cannot drift apart.
 */
export const claimSchema = registrationSchema.pick({
  username: true,
  password: true,
  acceptedTerms: true,
  acceptedUnusualClauses: true,
});

export type PasswordChangeField = "currentPassword" | "newPassword" | "newPasswordConfirmation";

/**
 * „Schimbă parola" in the portal, checked where the reader is looking: under the field — QA of
 * 27 September 2026. The errors came only as toasts, and an empty form answered „Parola e prea
 * scurtă" about a password nobody had typed, while the empty current password went unmentioned.
 *
 * The repetition is judged only once the new password itself is acceptable: a mismatch between
 * two passwords the form is about to refuse anyway is a second message about the same fix.
 */
export function passwordChangeProblems(form: {
  currentPassword: string;
  newPassword: string;
  newPasswordConfirmation: string;
}): Partial<Record<PasswordChangeField, string>> {
  const problems: Partial<Record<PasswordChangeField, string>> = {};
  if (!form.currentPassword) problems.currentPassword = "Scrie parola actuală.";
  if (!form.newPassword) {
    problems.newPassword = `Alege o parolă nouă, de cel puțin ${MIN_PASSWORD_LENGTH} caractere.`;
  } else if (form.newPassword.length < MIN_PASSWORD_LENGTH) {
    problems.newPassword = `Parola nouă e prea scurtă: alege cel puțin ${MIN_PASSWORD_LENGTH} caractere.`;
  } else if (form.newPassword !== form.newPasswordConfirmation) {
    problems.newPasswordConfirmation =
      "Parolele nu sunt identice. Repetă parola nouă exact ca mai sus.";
  }
  return problems;
}

/**
 * A refusal of the server that belongs under one field, or `null` for a failure that belongs to
 * nobody's field — the server down, too many attempts, a lost connection — which stays a toast.
 * The server's sentence is Romanian either way: `CURRENT_PASSWORD_WRONG` for the current password,
 * and the new password's length rule as the validation detail.
 */
export function passwordChangeRefusal(
  err: unknown
): { field: PasswordChangeField; message: string } | null {
  const code = apiErrorCode(err);
  if (code === "CURRENT_PASSWORD_WRONG") {
    return { field: "currentPassword", message: apiErrorMessage(err) };
  }
  if (code === "VALIDATION_FAILED") return { field: "newPassword", message: apiErrorMessage(err) };
  return null;
}
