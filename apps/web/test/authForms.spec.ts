import { describe, expect, it } from "vitest";
import {
  loginSchema,
  MIN_PASSWORD_LENGTH,
  passwordChangeProblems,
  passwordChangeRefusal,
  registrationSchema,
} from "~/composables/useAuthForms";

/**
 * The sign-in and register forms' own checks. The QA of 26 September 2026 reset a password to
 * "parola1" — which every screen that sets a password accepted — and could then never sign in: the
 * login form demanded eight characters and never sent the request.
 */
describe("the sign-in form", () => {
  it("sends any password the family typed, whatever its length", () => {
    expect(loginSchema.safeParse({ username: "elena.stan", password: "parola1" }).success).toBe(
      true
    );
    expect(loginSchema.safeParse({ username: "elena.stan", password: "abc123" }).success).toBe(
      true
    );
  });

  it("still asks for both fields, in Romanian", () => {
    const result = loginSchema.safeParse({ username: "", password: "" });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "Numele de utilizator este obligatoriu",
      "Parola este obligatorie",
    ]);
  });

  it("takes the space a phone keyboard adds after the username", () => {
    const result = loginSchema.safeParse({ username: "ioana.test ", password: "parola123" });
    expect(result.data?.username).toBe("ioana.test");
  });
});

describe("the register form", () => {
  it("asks for the same minimum as the server and the other password screens", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(6);
    const base = {
      username: "ioana.test",
      firstName: "Ioana",
      lastName: "Test",
      email: "ioana@example.com",
      acceptedTerms: true,
      acceptedUnusualClauses: true,
    };
    expect(registrationSchema.safeParse({ ...base, password: "parol1" }).success).toBe(true);
    const short = registrationSchema.safeParse({ ...base, password: "parol" });
    expect(short.error?.issues[0]?.message).toBe("Parola trebuie să aibă cel puțin 6 caractere");
  });

  it("says in Romanian when a name is too long", () => {
    const result = registrationSchema.safeParse({
      username: "u".repeat(31),
      password: "parola123",
      firstName: "a".repeat(101),
      lastName: "Test",
      email: "ioana@example.com",
      acceptedTerms: true,
      acceptedUnusualClauses: true,
    });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      "Numele de utilizator poate avea cel mult 30 de caractere",
      "Prenumele poate avea cel mult 100 de caractere",
    ]);
  });
});

/**
 * „Schimbă parola" in the portal — QA of 27 September 2026. Its errors came only as toasts, and an
 * empty form answered „Parola e prea scurtă" about a password nobody had typed, while the empty
 * current password went unmentioned. Each problem now belongs to the field it concerns.
 */
describe("the portal's password change", () => {
  const filled = {
    currentPassword: "parola-veche",
    newPassword: "parola-noua",
    newPasswordConfirmation: "parola-noua",
  };

  it("finds nothing wrong with a form filled in properly", () => {
    expect(passwordChangeProblems(filled)).toEqual({});
  });

  it("asks for the current password when it is empty, under its own field", () => {
    expect(passwordChangeProblems({ ...filled, currentPassword: "" })).toEqual({
      currentPassword: "Scrie parola actuală.",
    });
  });

  it("asks for a new password when none was typed, rather than calling it short", () => {
    const problems = passwordChangeProblems({
      currentPassword: "",
      newPassword: "",
      newPasswordConfirmation: "",
    });
    expect(problems.currentPassword).toBe("Scrie parola actuală.");
    expect(problems.newPassword).toBe(
      `Alege o parolă nouă, de cel puțin ${MIN_PASSWORD_LENGTH} caractere.`
    );
    expect(problems.newPassword).not.toMatch(/scurtă/);
  });

  it("calls a typed new password short when it is", () => {
    expect(
      passwordChangeProblems({ ...filled, newPassword: "abc", newPasswordConfirmation: "abc" })
    ).toEqual({
      newPassword: `Parola nouă e prea scurtă: alege cel puțin ${MIN_PASSWORD_LENGTH} caractere.`,
    });
  });

  it("puts a repetition that does not match under the repetition", () => {
    expect(passwordChangeProblems({ ...filled, newPasswordConfirmation: "parola-nou" })).toEqual({
      newPasswordConfirmation: "Parolele nu sunt identice. Repetă parola nouă exact ca mai sus.",
    });
  });

  it("puts a wrong current password under the current password", () => {
    const refused = {
      data: {
        statusCode: 400,
        code: "CURRENT_PASSWORD_WRONG",
        message: "Parola actuală nu este corectă.",
      },
    };
    expect(passwordChangeRefusal(refused)).toEqual({
      field: "currentPassword",
      message: "Parola actuală nu este corectă.",
    });
  });

  it("leaves a failure that is nobody's field to the toast", () => {
    expect(passwordChangeRefusal({ data: { statusCode: 500, code: "INTERNAL_ERROR" } })).toBeNull();
    expect(
      passwordChangeRefusal({ data: { statusCode: 429, code: "TOO_MANY_REQUESTS" } })
    ).toBeNull();
    expect(passwordChangeRefusal(new Error("Failed to fetch"))).toBeNull();
  });
});
