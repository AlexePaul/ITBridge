import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The unsubscribe page must never act on its own — E17/S4.
 *
 * The link that leads here arrives in an e-mail, and e-mail is full of things that follow links
 * without a person: Outlook's Safe Links, corporate security scanners, WhatsApp and Slack preview
 * bots, and the mail client's own prefetch. A page that unsubscribed on load would quietly opt out
 * families who never opened the message, and the trail would be indistinguishable from people
 * refusing — the school would conclude its newsletter was unwanted, and every one of those numbers
 * would be a scanner.
 *
 * So the rule is: the request lives behind a click, and nothing on this page fetches on mount.
 * A source sweep rather than a mounted component, because what must not exist is the thing to
 * assert on — there is no behaviour to drive when the bug is a call in the wrong place.
 */
const PAGE = readFileSync(new URL("../app/pages/dezabonare.vue", import.meta.url), "utf8");

describe("the unsubscribe page", () => {
  it("does not fetch on mount, in any of its spellings", () => {
    expect(PAGE).not.toMatch(/onMounted/);
    expect(PAGE).not.toMatch(/useAsyncData|useFetch|callOnce/);
    // `watch(..., { immediate: true })` runs on setup and is the same bug wearing a hat.
    expect(PAGE).not.toMatch(/immediate:\s*true/);
  });

  it("calls the API only from the click handler", () => {
    // The one call, inside the one function the button is bound to.
    expect(PAGE).toMatch(/@click="confirm"/);
    expect(PAGE).toMatch(/async function confirm\(\)[\s\S]*marketingApi\.unsubscribe/);
  });

  it("keeps itself out of the index", () => {
    // Not a page anybody searches for, and a crawler that indexed it would be indexing somebody's
    // unsubscribe link. It is deliberately absent from `PUBLIC_PAGES` too, so the sitemap-driven
    // CI gates do not visit it.
    expect(PAGE).toMatch(/noindex:\s*true/);
  });
});
