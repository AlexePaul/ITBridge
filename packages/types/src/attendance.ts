import type { ClassSession } from './class-session';
import type { Group } from './group';

/**
 * What kind of session an attendance record belongs to.
 *
 * A database enum now, so these are the only values the column accepts — the old varchar defaulted
 * to `'normal'`, which the service never wrote and the frontend could not render, so any row
 * created outside `createAttendance` showed up with an empty session type.
 */
export enum AttendanceType {
    /** The child's own group. */
    REGULAR = 'regular',
    /** A catch-up session, attended with a group that is not the child's own. */
    MAKE_UP = 'make-up',
}

/** Romanian names — this is what a parent reads in the attendance table. */
export const ATTENDANCE_TYPE_LABELS: Record<AttendanceType, string> = {
    [AttendanceType.REGULAR]: 'Normală',
    [AttendanceType.MAKE_UP]: 'Recuperare',
};

export interface Attendance {
    id: number;
    /**
     * The class this mark is about. It carries the date, the hours, the room and the status.
     *
     * The record used to hold its own `date` and `startTime`. They are gone: the session has them,
     * and a copy that nothing keeps in step is a second answer to "when was this class?" waiting to
     * disagree with the first.
     */
    classSession: ClassSession;
    /**
     * The group the child sat with. Same value as `classSession.group`, kept while the attendance
     * screens still filter on it directly; the session is where it will come from.
     */
    group: Group;
    type: AttendanceType;
    present: boolean;
}
