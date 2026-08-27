// The contract lives in packages/types. This file stays as a bridge so the existing
// `~/types/...` imports do not change - but it no longer redeclares anything.
export type { Attendance } from "@itbridge/types";
// A value, not just a type: AttendanceType is an enum and the labels are a lookup table.
export { AttendanceType, ATTENDANCE_TYPE_LABELS } from "@itbridge/types";
