import { describe, expect, it } from "vitest";
import {
  announcementDraftKey,
  useAlreadySentGuard,
  type AnnouncementDraft,
} from "~/composables/useAnnouncementDraft";

/**
 * /admin/anunturi, QA of 27 September 2026: after the server refused a send as already sent today,
 * the confirm dialog stayed open and „Trimite" could be pressed again for another 409. The server's
 * duplicate guard reads audience, kind and wording on the school's day, so the same draft is refused
 * all day — the screen remembers it and keeps the button off until something in it changes.
 */
describe("an announcement refused as already sent", () => {
  const draft: AnnouncementDraft = {
    audience: "group",
    groupId: 3,
    locationId: undefined,
    kind: "transactional",
    subject: "Sâmbătă e zi liberă",
    body: "Nu se țin ore sâmbătă, 4 octombrie.",
  };

  it("is the same announcement to the server only when audience, kind and wording are all the same", () => {
    expect(announcementDraftKey({ ...draft })).toBe(announcementDraftKey(draft));
    expect(announcementDraftKey({ ...draft, body: `${draft.body}!` })).not.toBe(
      announcementDraftKey(draft)
    );
    expect(announcementDraftKey({ ...draft, kind: "marketing" })).not.toBe(
      announcementDraftKey(draft)
    );
    expect(announcementDraftKey({ ...draft, groupId: 4 })).not.toBe(announcementDraftKey(draft));
    expect(announcementDraftKey({ ...draft, audience: "all", groupId: undefined })).not.toBe(
      announcementDraftKey(draft)
    );
  });

  it("keeps the draft refused until it changes, and nothing else", () => {
    const guard = useAlreadySentGuard();
    expect(guard.isRefused(draft)).toBe(false);

    guard.remember(draft);

    expect(guard.isRefused({ ...draft })).toBe(true);
    expect(guard.isRefused({ ...draft, subject: "Sâmbătă e liber" })).toBe(false);
  });
});
