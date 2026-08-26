// The contract lives in packages/types. This file stays as a bridge so the existing
// `~/types/...` imports do not change - but it no longer redeclares anything.
export type { Attendance, AttendanceType } from "@itbridge/types";
