// The contract lives in packages/types. This file is the usual thin bridge, so pages import from
// `~/types/...` like everything else.
export type { ClassSession, ClassSessionWithAttendance } from "@itbridge/types";
// Values, not just types: the status is an enum and the Romanian labels are a lookup table.
export { ClassSessionStatus, CLASS_SESSION_STATUS_LABELS } from "@itbridge/types";
