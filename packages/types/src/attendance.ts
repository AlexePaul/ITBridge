import type { ISODate, TimeOfDay } from './common';
import type { Group } from './group';

/**
 * The values `AttendanceService.createAttendance` actually writes: `'regular'` for a child in their
 * own group, `'make-up'` for one attending a catch-up session.
 *
 * Beware: two further values exist in the code that the service never writes and that do not belong
 * here — the column default in `attendance.entity.ts` is `'normal'`, and the `@ApiProperty` example
 * on `markAttendance.dto.ts` says `'catch-up'`. Those are inconsistent leftovers; the default can
 * still show up on rows inserted straight into the database, which is why consumers treat unknown
 * values with a fallback rather than an error.
 */
export type AttendanceType = 'regular' | 'make-up';

export interface Attendance {
    id: number;
    group: Group;
    date: ISODate;
    startTime: TimeOfDay;
    type: AttendanceType;
    present: boolean;
}
