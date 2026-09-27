import { ref } from "vue";
import type { AnnouncementAudience, AnnouncementKind } from "~/types/announcement.types";

/** What the announcements screen is about to send. */
export interface AnnouncementDraft {
  audience: AnnouncementAudience;
  groupId: number | undefined;
  locationId: number | undefined;
  kind: AnnouncementKind;
  subject: string;
  body: string;
}

/**
 * The draft as the server's duplicate guard reads it — `announcementDedupeKey` in
 * `announcement.service.ts`: audience, group, location, kind, subject and body, on the school's
 * day. Two drafts with the same key are the same announcement to the server, and the second one of
 * the day is refused.
 */
export function announcementDraftKey(draft: AnnouncementDraft): string {
  return JSON.stringify([
    draft.audience,
    draft.groupId ?? null,
    draft.locationId ?? null,
    draft.kind,
    draft.subject,
    draft.body,
  ]);
}

/**
 * The announcement the server refused as already sent today (`ANNOUNCEMENT_ALREADY_SENT`),
 * remembered while it is still the draft on screen — QA of 27 September 2026. The same request is
 * refused again all day, so the send button waits for the draft to change instead of offering a
 * second 409; a correction of one character is another announcement, and goes.
 */
export function useAlreadySentGuard() {
  const refusedKey = ref<string | null>(null);
  return {
    remember: (draft: AnnouncementDraft) => {
      refusedKey.value = announcementDraftKey(draft);
    },
    isRefused: (draft: AnnouncementDraft) => refusedKey.value === announcementDraftKey(draft),
  };
}
