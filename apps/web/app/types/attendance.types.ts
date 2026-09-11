// The contract lives in packages/types. This file stays as a bridge so the existing
// `~/types/...` imports do not change - but it no longer redeclares anything.
export type {
  AbsenceNotice,
  AnnounceAbsenceDto,
  Attendance,
  AttendanceType,
  PlaceReplacementDto,
  ReplacementOption,
  SessionRegister,
  SessionRegisterEntry,
} from "@itbridge/types";

import type { AttendanceType as Kind } from "@itbridge/types";

/*
 * `MAKE_UP_STATUS_LABELS` and `MAKE_UP_STATUS_COLORS` used to live here — E12/S4.
 *
 * They rendered the four states of a make-up credit: available, booked, consumed, expired. There
 * is no credit and therefore no state to name. An announced absence either carries the class the
 * office moved the child into or it does not, and the two read as one sentence each rather than as
 * a badge — so the words belong in the screen that says them, not in a lookup table.
 */

/**
 * The two kinds of mark, as something a screen can compare against.
 *
 * Here rather than in `@itbridge/types`, and for the reason recorded in that file: the contract
 * package is CommonJS, Vite pre-bundles it, and a runtime value exported from there has twice
 * arrived in the browser as `undefined` — once an enum whose body the pre-bundler dropped while
 * keeping its export line. Silently, too: the comparison throws inside a `computed` and Vue
 * abandons the subtree without a word in the console. This one was still an enum in the contract
 * until now, and it is read on the parent's own dashboard, where a blank subtree is a family told
 * nothing about whether their child came to class.
 *
 * `as const satisfies` rather than an `enum`, exactly like `SessionStatus`: the values stay the
 * literals the wire carries, so `MarkType.MAKE_UP === record.type` type-checks against the union.
 * Named apart from the type it belongs to for the same reason `SessionStatus` is — one name cannot
 * be both a re-exported type and a local `const` in one module.
 */
export const MarkType = {
  /** The child's own group. */
  REGULAR: "regular",
  /** A catch-up class, attended with a group that is not the child's own. */
  MAKE_UP: "make-up",
} as const satisfies Record<string, Kind>;

/** Romanian names — this is what a parent reads in the attendance table. */
export const ATTENDANCE_TYPE_LABELS: Record<Kind, string> = {
  regular: "Normală",
  "make-up": "Recuperare",
};
