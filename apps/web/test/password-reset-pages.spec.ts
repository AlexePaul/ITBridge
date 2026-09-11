import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The two public password pages, swept as source.
 *
 * Both rules below are about something that must *not* be there, which is why this is a sweep
 * rather than a mounted component: there is no behaviour to drive when the defect is a call in the
 * wrong place or a sentence that says too much.
 */
const FORGOT = readFileSync(
  new URL("../app/pages/auth/forgot-password.vue", import.meta.url),
  "utf8"
);
const RESET = readFileSync(
  new URL("../app/pages/auth/reset-password.vue", import.meta.url),
  "utf8"
);
const PANEL = readFileSync(new URL("../app/components/AuthPanel.vue", import.meta.url), "utf8");
const API = readFileSync(new URL("../app/composables/api/useAuthApi.ts", import.meta.url), "utf8");

describe("the forgot-password page", () => {
  it("asks before it sends, so a link preview cannot request a reset", () => {
    // Same reasoning as `/dezabonare`: mail clients, scanners and preview bots open links without
    // a person. Here the cost is smaller — a mail nobody asked for — but the shape is the rule.
    expect(FORGOT).not.toMatch(/onMounted/);
    expect(FORGOT).not.toMatch(/useAsyncData|useFetch|callOnce/);
    expect(FORGOT).not.toMatch(/immediate:\s*true/);
  });

  it("never says whether the address has an account", () => {
    // The server answers 200 either way precisely so this screen has nothing to branch on. A
    // sentence naming the missing account would turn the form into a way of asking whether a
    // given family is at this school.
    expect(FORGOT).not.toMatch(/nu (există|are) (un )?cont/i);
    expect(FORGOT).toMatch(/Dacă adresa/);
  });

  it("keeps itself out of the index", () => {
    expect(FORGOT).toMatch(/noindex:\s*true/);
  });
});

describe("the reset-password page", () => {
  it("does not spend the link on load — the password is the point", () => {
    // Unlike `confirm-email.vue`, which acts on mount because clicking *is* the confirmation.
    expect(RESET).not.toMatch(/onMounted/);
    expect(RESET).not.toMatch(/useAsyncData|useFetch|callOnce/);
    expect(RESET).not.toMatch(/immediate:\s*true/);
  });

  it("checks the repeated password, which is the one thing the server cannot", () => {
    // The server receives one password. A mistyped repetition would lock a parent out of the
    // account they were in the middle of recovering, and only this screen can see it.
    expect(RESET).toMatch(/password\.value !== confirmation\.value/);
  });

  it("drops the local tokens, because the server has revoked every session", () => {
    expect(RESET).toMatch(/clearTokens\(\)/);
  });

  it("keeps itself out of the index", () => {
    expect(RESET).toMatch(/noindex:\s*true/);
  });
});

describe("the way in", () => {
  it("is linked from the login form and only from there", () => {
    // A parent filling in the register form has no password to have forgotten.
    expect(PANEL).toMatch(/v-if="isLogin"[\s\S]{0,200}\/auth\/forgot-password/);
  });

  it("goes through the API composable, never a bare fetch", () => {
    for (const page of [FORGOT, RESET]) {
      expect(page).not.toMatch(/\$fetch\(/);
      expect(page).toMatch(/useAuthApi/);
    }
  });

  it("exposes all three password calls", () => {
    for (const name of ["forgotPassword", "resetPassword", "changePassword"]) {
      expect(API).toMatch(new RegExp(`const ${name} = async`));
      // Returned as well as declared: a call the factory keeps to itself is a call no screen has.
      expect(API).toMatch(new RegExp(`\\n\\s*${name},`));
    }
  });
});
