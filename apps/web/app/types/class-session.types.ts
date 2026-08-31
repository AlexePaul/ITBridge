// The contract lives in packages/types. This file is the usual thin bridge, so pages import from
// `~/types/...` like everything else.
import type { ClassSession } from "@itbridge/types";

export type {
  ClassSession,
  ClassSessionWithAttendance,
  NonTeachingImpact,
  NonTeachingPeriod,
} from "@itbridge/types";
import type { ClassSessionStatus } from "@itbridge/types";

export type { ClassSessionStatus };

/**
 * The three status values, as something a screen can compare against.
 *
 * Here rather than in `@itbridge/types` for the reason recorded in that file: the contract package
 * is CommonJS, Vite pre-bundles it, and a runtime value exported from there has twice arrived in
 * the browser as `undefined` — silently, because the comparison throws inside a `computed` and Vue
 * drops the subtree without a word in the console.
 *
 * `as const satisfies` rather than an `enum`: the values stay the literals the wire carries, so
 * `SessionStatus.CANCELLED === session.status` type-checks against the union.
 */
export const SessionStatus = {
  SCHEDULED: "scheduled",
  HELD: "held",
  CANCELLED: "cancelled",
} as const satisfies Record<string, ClassSessionStatus>;

/** Romanian names — this is what an admin reads in the timetable. */
export const CLASS_SESSION_STATUS_LABELS: Record<ClassSessionStatus, string> = {
  scheduled: "Programată",
  held: "Ținută",
  cancelled: "Anulată",
};

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
  /** Days the horizon fell on that the school calendar closes. Reported so a short term is explained. */
  skipped: number;
  sessions: ClassSession[];
}
