import * as z from "zod";

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
