// The contract lives in packages/types. This file stays as a bridge so the existing
// `~/types/...` imports do not change - but it no longer redeclares anything.
export type {
  AbsenceNotice,
  AnnounceAbsenceDto,
  Attendance,
  PlaceReplacementDto,
  ReplacementOption,
  SessionRegister,
  SessionRegisterEntry,
} from "@itbridge/types";

/*
 * `MAKE_UP_STATUS_LABELS` and `MAKE_UP_STATUS_COLORS` used to live here — E12/S4.
 *
 * They rendered the four states of a make-up credit: available, booked, consumed, expired. There
 * is no credit and therefore no state to name. An announced absence either carries the class the
 * office moved the child into or it does not, and the two read as one sentence each rather than as
 * a badge — so the words belong in the screen that says them, not in a lookup table.
 */

// A value, not just a type: AttendanceType is an enum and the labels are a lookup table.
export { AttendanceType, ATTENDANCE_TYPE_LABELS } from "@itbridge/types";
