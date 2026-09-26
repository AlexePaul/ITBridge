import { describe, expect, it } from "vitest";
import { loginSchema, MIN_PASSWORD_LENGTH, registrationSchema } from "~/composables/useAuthForms";

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
