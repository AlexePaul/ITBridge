import { defineStore } from "pinia";

/**
 * What a reader can be asked to agree to before the page loads it (E07 S5).
 *
 * One entry today, `map`: the Google Maps embed on the two location pages, the only thing on the
 * public site that reaches a third party. It is a named list rather than a boolean because the
 * next entry is already written down — the traffic analytics of E19 S8, which waits on this story
 * precisely so it has a gate to sit behind — and a second boolean would be a second place that
 * answers "has the reader agreed", which is the shape of every divergence in this repo.
 */
export type ConsentPurpose = "map";

/**
 * Consent for this visit, held in memory and **never written down**.
 *
 * That is the answer to the open question in the cookie policy — remember the choice in a
 * `mapConsent` cookie, or ask every time. Neither, exactly: within one visit the reader presses
 * once and both location pages honour it; a new visit asks again. The reason is a sentence the
 * policy makes to every reader and that a stored choice would cost — *visitors to the public site
 * who do not log in receive no cookie at all*. A consent cookie is lawful without consent, so this
 * is not a legal constraint; it is that a promise which is simply true beats one with a footnote,
 * and the price is one press per visit on two of a dozen pages.
 *
 * Being in memory has a second effect worth naming: on the server it is always empty, so the
 * rendered HTML never contains the embed, and there is nothing for a reader with JavaScript off to
 * be surprised by later.
 */
export const useConsentStore = defineStore("consent", () => {
  const granted = ref<ConsentPurpose[]>([]);

  const has = (purpose: ConsentPurpose): boolean => granted.value.includes(purpose);

  const grant = (purpose: ConsentPurpose) => {
    if (!has(purpose)) granted.value = [...granted.value, purpose];
  };

  /**
   * Withdrawal, for a purpose that has not fired yet.
   *
   * Nothing calls it today, and the map deliberately does not offer it: once Google has answered
   * the request, a button that claims to take it back would be describing something that already
   * happened. It exists because analytics is the opposite case — a script that can be stopped
   * mid-visit — and because a consent store without one reads as if consent were permanent.
   */
  const withdraw = (purpose: ConsentPurpose) => {
    granted.value = granted.value.filter((entry) => entry !== purpose);
  };

  return { granted: readonly(granted), has, grant, withdraw };
});
