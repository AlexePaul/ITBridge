import type { ISODate, ISODateTime, TimeOfDay } from './common';
import type { Group } from './group';
import type { Location } from './location';
import type { Room } from './room';

/**
 * The life of one scheduled class. Mirrors `ClassSessionStatus` in
 * `apps/api/src/enum/class-session-status.enum.ts`.
 *
 * Three values, not the four E12/S1 sketches: a moved session is one whose date, time or room
 * changed, and those are fields, not a state.
 *
 * A union of literals rather than an `enum`, and the Romanian labels have moved to
 * `apps/web/app/types/class-session.types.ts`. This package is CommonJS, Vite pre-bundles it, and a
 * runtime value exported from here has twice reached the browser as `undefined` — silently, because
 * the lookup throws inside a `computed` and Vue simply drops that subtree. `'scheduled'` is what
 * goes over the wire; `'Programată'` is something only a screen needs.
 *
 * - `scheduled` — generated from the group timetable, not yet taught.
 * - `held` — it happened.
 * - `cancelled` — it will not happen: a holiday, a sick teacher, a snow day.
 */
export type ClassSessionStatus = 'scheduled' | 'held' | 'cancelled';

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
    /**
     * Held in a school holiday, for whoever wanted to come — E12/S8. Put there by whoever takes
     * the register. What it means for money is E15/S9: billed only to the children marked present.
     */
    isVacation: boolean;
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

/**
 * A stretch of days on which the school does not teach — E12/S2.
 *
 * A period, not a day: a fortnight of holiday is one row, a public holiday is one row with both
 * dates equal. `location` absent means the whole school, which is the case for all of them today.
 */
export interface NonTeachingPeriod {
    id: number;
    name: string;
    startDate: ISODate;
    /** Inclusive. */
    endDate: ISODate;
    location?: Location | null;
    createdAt: ISODateTime;
}

/**
 * What adding a period would cancel, asked before it is added.
 *
 * This is the safety net of the screen: a mistyped date shows up as "grupa de luni pierde 8
 * ședințe" rather than as a gap somebody notices in January.
 */
export interface NonTeachingImpact {
    affected: { id: number; date: ISODate; groupId: number; groupName: string }[];
    byGroup: { groupId: number; groupName: string; count: number; dates: ISODate[] }[];
}

/**
 * One free slot a class that cannot be held could move into — E12/S9. `HH:mm`, not `HH:mm:ss`:
 * these are computed, not read off a `time` column, and the write takes `HH:mm`.
 */
export interface RescheduleWindow {
    date: ISODate;
    startTime: TimeOfDay;
    endTime: TimeOfDay;
    roomId: number;
    roomName: string;
    locationName: string;
}

/** The row on the missed day, as the screen describes it. `null` in the result when generation never wrote one. */
export interface RescheduleSource {
    id: number;
    status: ClassSessionStatus;
    hasAttendance: boolean;
    startTime: TimeOfDay;
    endTime: TimeOfDay;
    roomId: number;
    roomName: string;
    notes: string | null;
}

/**
 * What `GET /class-sessions/reschedule-windows` answers — E12/S9.
 *
 * The week, the class as it stands on the missed day, why it could not be recovered at all
 * (`blocked`, with the same code the write would refuse with), and every free slot of the week.
 * `windows` is empty both when blocked and when the week simply has nothing free; the screen tells
 * the two apart by `blocked`.
 */
export interface RescheduleWindows {
    week: { from: ISODate; to: ISODate };
    missedDate: ISODate;
    /** Whether the school calendar closes the missed day — the usual reason there is no row, or a cancelled one. */
    missedDayClosed: boolean;
    /** The group's own hour and room, what the class defaults to if only the day changes. */
    usual: { startTime: TimeOfDay; endTime: TimeOfDay; roomId: number; roomName: string };
    source: RescheduleSource | null;
    blocked: {
        code: 'CLASS_SESSION_HAS_ATTENDANCE' | 'CLASS_SESSION_NOT_FOUND' | 'GROUP_ALREADY_HAS_SESSION_THAT_WEEK';
        message: string;
    } | null;
    windows: RescheduleWindow[];
}

/**
 * Body for `POST /class-sessions/reschedule` — E12/S9. Keyed on the group and the day the class
 * was, or would have been, on; `targetDate` must fall in the same week. Hour and room default to
 * the class's own.
 */
export interface RescheduleClassSessionPayload {
    groupId: number;
    date: ISODate;
    targetDate: ISODate;
    startTime?: TimeOfDay;
    endTime?: TimeOfDay;
    roomId?: number;
    reason: string;
}
