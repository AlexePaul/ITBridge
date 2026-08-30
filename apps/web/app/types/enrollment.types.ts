export type {
  DemandBucket,
  Enrollment,
  EnrollmentStatus,
  GroupOccupancy,
  WaitlistEntry,
  WaitlistStatus,
} from "@itbridge/types";

import type { EnrollmentStatus, WaitlistStatus } from "@itbridge/types";

/**
 * Romanian labels for the two enrolment statuses — E11/S1 and S3.
 *
 * Defined here, not in `@itbridge/types`, and that is deliberate. The contract package is CommonJS
 * and Vite pre-bundles it; a runtime value exported from there has twice reached the browser as
 * `undefined`, and the failure mode is silent — the lookup throws inside a `computed`, Vue drops
 * that subtree, and a card just does not appear. Nothing in the build or the tests goes red.
 *
 * It is also the right place on its own merits: the wire carries `'TRIAL'`, and `'Probă'` is
 * something only a screen needs.
 */
export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  TRIAL: "Probă",
  ACTIVE: "Activă",
  COMPLETED: "Încheiată",
  WITHDRAWN: "Abandonată",
  TRANSFERRED: "Transferată",
};

export const WAITLIST_STATUS_LABELS: Record<WaitlistStatus, string> = {
  WAITING: "Pe listă",
  OFFERED: "Loc oferit",
  ACCEPTED: "A acceptat",
  DECLINED: "A refuzat",
  EXPIRED: "Fără răspuns",
  CANCELLED: "Retrasă",
};
