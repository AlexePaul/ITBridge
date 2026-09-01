// The contract lives in packages/types. This file stays as a bridge so the existing
// `~/types/...` imports do not change - but it no longer redeclares anything.
export type {
  AbsenceNotice,
  AnnounceAbsenceDto,
  Attendance,
  BookMakeUpDto,
  MakeUpCredit,
  MakeUpOption,
  MakeUpStatus,
  SessionRegister,
  SessionRegisterEntry,
} from "@itbridge/types";

import type { MakeUpStatus } from "@itbridge/types";

/**
 * Romanian labels for the make-up states — E12/S4. Next to the screens, per the standing rule:
 * the contract package is CommonJS and ships no runtime values.
 */
export const MAKE_UP_STATUS_LABELS: Record<MakeUpStatus, string> = {
  available: "Disponibilă",
  booked: "Programată",
  consumed: "Folosită",
  expired: "Expirată",
};

export const MAKE_UP_STATUS_COLORS: Record<
  MakeUpStatus,
  "success" | "info" | "neutral" | "warning"
> = {
  available: "success",
  booked: "info",
  consumed: "neutral",
  expired: "warning",
};
// A value, not just a type: AttendanceType is an enum and the labels are a lookup table.
export { AttendanceType, ATTENDANCE_TYPE_LABELS } from "@itbridge/types";
