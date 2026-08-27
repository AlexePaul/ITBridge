import type { ISODate, TimeOfDay } from './common';
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
    group: Group;
    date: ISODate;
    startTime: TimeOfDay;
    type: AttendanceType;
    present: boolean;
}
