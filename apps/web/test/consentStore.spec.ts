import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useConsentStore } from "~/stores/consentStore";

/**
 * E07/S5. Two things about consent are worth a test rather than a reading: that it starts empty,
 * because the map gate turns on whatever this says and a store that began granted would open it
 * for everybody; and that granting it writes nothing down, because the cookie policy tells every
 * reader that a public visit leaves no cookie at all.
 *
 * The gate itself — that the iframe is absent from the DOM rather than hidden — is checked where
 * it can actually be observed: `scripts/check-third-party.mjs` loads the real pages in a real
 * browser and fails on a request leaving the origin. A unit test here would only be re-reading
 * `v-if`, and the bug this story fixed was invisible in the source and obvious in the network tab.
 */
describe("consentStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("starts with nothing granted", () => {
    const consent = useConsentStore();

    expect(consent.has("map")).toBe(false);
    expect(consent.granted).toEqual([]);
  });

  it("remembers a purpose once it is granted", () => {
    const consent = useConsentStore();

    consent.grant("map");

    expect(consent.has("map")).toBe(true);
  });

  it("grants a purpose once, however many times it is pressed", () => {
    const consent = useConsentStore();

    consent.grant("map");
    consent.grant("map");

    expect(consent.granted).toEqual(["map"]);
  });

  it("withdraws a purpose it had granted", () => {
    const consent = useConsentStore();

    consent.grant("map");
    consent.withdraw("map");

    expect(consent.has("map")).toBe(false);
  });

  // The promise in the cookie policy is that a visitor to the public site who does not log in gets
  // no cookie at all. Consent is the one piece of public-page state that would tempt somebody to
  // store — a `mapConsent` cookie is even named in the draft as an option — so the line is held
  // here rather than in prose. A store that reached for a cookie would be caught by the stub the
  // suite installs for `useCookie`, whether or not anybody remembered to look.
  it("keeps consent in memory, never in a cookie", () => {
    const useCookieSpy = vi.spyOn(
      globalThis as unknown as { useCookie: () => unknown },
      "useCookie"
    );

    const consent = useConsentStore();
    consent.grant("map");

    expect(useCookieSpy).not.toHaveBeenCalled();
  });

  // A fresh visit is a fresh store, which is what "we ask again next visit" means in code.
  it("forgets everything when the visit ends", () => {
    useConsentStore().grant("map");

    setActivePinia(createPinia());

    expect(useConsentStore().has("map")).toBe(false);
  });
});
