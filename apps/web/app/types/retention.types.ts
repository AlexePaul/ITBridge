export type {
  FamilyRetention,
  RetentionHold,
  RetentionRow,
  RetentionSchedule,
  RetentionTerms,
} from "@itbridge/types";

import type { RetentionHold } from "@itbridge/types";

/**
 * Why a family whose term has come is still on file — E22/S3. Each names who has to act, because
 * each waits on somebody different: the office for the first two, the family for the third.
 */
export const RETENTION_HOLD_LABELS: Record<RetentionHold, string> = {
  enrolment_in_force: "Are încă un copil înscris — încheie înscrierea sau anulează retragerea.",
  on_waitlist: "E încă pe o listă de așteptare — scoate-o de acolo sau anulează retragerea.",
  owes_money: "Are o factură neplătită — datele rămân până e achitată.",
};
