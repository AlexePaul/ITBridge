/**
 * What kind of session an attendance record belongs to.
 *
 * These are the values `AttendanceService.createAttendance` writes, and now the only ones the
 * column accepts. Before this was an enum the column was a plain varchar whose default was
 * `'normal'` — a value the service never writes and the frontend never renders, so any row created
 * outside the service showed up blank in the admin screens.
 */
export enum AttendanceType {
    /** The child's own group. */
    REGULAR = 'regular',
    /** A catch-up session, attended with a group that is not the child's own. */
    MAKE_UP = 'make-up',
}
