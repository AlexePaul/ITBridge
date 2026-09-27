import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia, type Pinia } from "pinia";
import { useTokenStore } from "~/stores/tokenStore";

/**
 * The access token is not Pinia state, so it is never written into a page.
 *
 * Nuxt serialises every store's state into the HTML of a page it renders on the server, for the
 * browser to pick up. The public pages it renders per request — `/proba`, `/dezabonare`, the sign-in
 * form — render with the visitor's cookies, and the token store returned its cookie as a ref, which
 * Pinia counts as state: measured on a production build, `curl -H "Cookie: accessToken=…" /proba`
 * came back with the token in the page (review of 27 September 2026). It went to nobody else — but
 * a credential has no business in a document that sits in the back-forward cache, in "Save page
 * as", and in whatever reads the page's payload.
 *
 * A computed is not state: the stores read it exactly as before, and nothing serialises it.
 */
describe("the token store's state", () => {
  let pinia: Pinia;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
  });

  it("holds no token for a page to carry", () => {
    const tokens = useTokenStore();
    tokens.setAccessToken("ACCESS-TOKEN-VALUE");
    tokens.setRefreshToken("REFRESH-TOKEN-VALUE", true);

    const serialised = JSON.stringify(pinia.state.value);

    expect(serialised).not.toContain("ACCESS-TOKEN-VALUE");
    expect(serialised).not.toContain("REFRESH-TOKEN-VALUE");
    // …and the store still answers with both, which is everything its readers ask of it.
    expect(tokens.accessToken).toBe("ACCESS-TOKEN-VALUE");
    expect(tokens.refreshToken).toBe("REFRESH-TOKEN-VALUE");
  });
});
