export type {
  ChildConsents,
  ConsentChannel,
  ConsentInForce,
  FamilyConsents,
  PublicationConsentRecord,
  PublicationPurpose,
  PurposeConsent,
} from "@itbridge/types";

import type { ConsentChannel, PublicationPurpose } from "@itbridge/types";

/** What each purpose is called on a screen — E07/S2. One today; the showcase joins it with E14 S6. */
export const PURPOSE_LABELS: Record<PublicationPurpose, string> = {
  promotion: "Materialele de promovare ale școlii",
};

/** Whose hands wrote it down, as a family and the office both read it. */
export const CHANNEL_LABELS: Record<ConsentChannel, string> = {
  portal: "din portal",
  office: "consemnat de birou",
};
