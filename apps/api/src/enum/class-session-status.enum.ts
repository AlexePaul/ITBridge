/**
 * The life of one scheduled class.
 *
 * Three values, not four. E12/S1 lists a fourth, `mutată` (moved), but a moved session is not a
 * state — it is a session whose `date`, `startTime` or `room` changed, and those are already
 * columns. A separate `moved` status would say "this row was edited" without saying to what, and
 * would have to be kept in step with the columns by hand. The day someone needs the audit trail,
 * it is a history table, not a status.
 */
export enum ClassSessionStatus {
    /** Generated from the group timetable, not yet taught. The state every session starts in. */
    SCHEDULED = 'scheduled',
    /** It happened. Attendance for it is meaningful. */
    HELD = 'held',
    /**
     * It will not happen: a holiday, a sick teacher, a snow day. There is no holiday calendar yet
     * (E12/S2 is not built), so a session falling in a school holiday is cancelled by hand.
     */
    CANCELLED = 'cancelled',
}
