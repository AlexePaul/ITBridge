export type {
  AnnouncementAudience,
  AnnouncementAudienceBreakdown,
  AnnouncementDetail,
  AnnouncementKind,
  AnnouncementPreview,
  AnnouncementResult,
  AnnouncementSummary,
  AnnouncementUndeliverableRecipient,
  SendAnnouncementDto,
} from "@itbridge/types";

import type { AnnouncementAudience, AnnouncementKind } from "@itbridge/types";

/** Romanian labels for announcements — E17/S7. Next to the screen, per the standing rule. */
export const AUDIENCE_LABELS: Record<AnnouncementAudience, string> = {
  group: "O grupă",
  location: "O locație",
  all: "Toată școala",
};

/**
 * What each kind means in the school's own words, because the choice is a legal one and the admin
 * making it should not have to know the word "transactional".
 */
export const KIND_LABELS: Record<AnnouncementKind, string> = {
  transactional: "Operațional",
  marketing: "Promoțional",
};

export const KIND_HINTS: Record<AnnouncementKind, string> = {
  transactional:
    "Ceva ce familia trebuie să afle ca să vină la oră: zi liberă, schimbare de sală, orar. Ajunge la toți.",
  marketing:
    "Ceva ce familia poate refuza fără să piardă nimic: tabere, oferte, evenimente. Ajunge doar la cine a bifat în setări.",
};
