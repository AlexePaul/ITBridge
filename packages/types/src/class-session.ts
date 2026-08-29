import type { ISODate, TimeOfDay } from './common';
import type { Group } from './group';
import type { Room } from './room';

/**
 * The life of one scheduled class.
 *
 * Three values, not the four E12/S1 sketches: a moved session is one whose date, time or room
 * changed, and those are fields, not a state.
 */
export enum ClassSessionStatus {
    /** Generated from the group timetable, not yet taught. */
    SCHEDULED = 'scheduled',
    /** It happened. */
    HELD = 'held',
    /** It will not happen: a holiday, a sick teacher, a snow day. */
    CANCELLED = 'cancelled',
}

/** Romanian names — this is what an admin reads in the timetable. */
export const CLASS_SESSION_STATUS_LABELS: Record<ClassSessionStatus, string> = {
    [ClassSessionStatus.SCHEDULED]: 'Programată',
    [ClassSessionStatus.HELD]: 'Ținută',
    [ClassSessionStatus.CANCELLED]: 'Anulată',
};

/**
 * One class of one group, on one day.
 *
 * `room` is the room the class is actually in, copied from the group when the session was
 * generated — not read through `group.room`. Moving a group to a different room changes where its
 * future classes are, not where the past ones were.
 */
export interface ClassSession {
    id: number;
    group: Group;
    date: ISODate;
    startTime: TimeOfDay;
    endTime: TimeOfDay;
    room: Room;
    status: ClassSessionStatus;
    notes: string | null;
}

/**
 * What `GET /class-sessions` returns: the session, plus whether anybody took the register for it.
 *
 * The flag is derived, not stored — a count of attendance rows, reduced to a boolean. The marks
 * themselves are not on the wire here: this list is a schedule, and shipping every child's
 * attendance on every row would make it a report about children instead.
 */
export interface ClassSessionWithAttendance extends ClassSession {
    hasAttendance: boolean;
}
