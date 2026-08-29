// The contract lives in packages/types. This file is the usual thin bridge, so pages import from
// `~/types/...` like everything else.
import type { ClassSession } from "@itbridge/types";

export type { ClassSession, ClassSessionWithAttendance } from "@itbridge/types";
// Values, not just types: the status is an enum and the Romanian labels are a lookup table.
export { ClassSessionStatus, CLASS_SESSION_STATUS_LABELS } from "@itbridge/types";

/**
 * What `POST /class-sessions/generate` answers.
 *
 * Declared here rather than re-exported, because `packages/types` does not carry this shape yet -
 * it mirrors `GenerateClassSessionsResult` in
 * `apps/api/src/modules/class-session/class-session.service.ts` field for field. If a field is ever
 * added on that side, move the whole interface into the contract package instead of editing both:
 * the point of `packages/types` is that a divergence breaks `typecheck` rather than a screen.
 */
export interface GenerateClassSessionsResult {
  /** First and last day of the horizon, both inclusive - what the caller asked for. */
  from: string;
  to: string;
  /** How many groups were considered, which is 1 for a targeted run. */
  groups: number;
  created: number;
  /** Sessions the horizon wanted that were already there. On a second run this is all of them. */
  existing: number;
  sessions: ClassSession[];
}
