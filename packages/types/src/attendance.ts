import type { ClassSession, ClassSessionStatus } from './class-session';
import type { ISODate, ISODateTime, TimeOfDay } from './common';
import type { Group } from './group';

/**
 * What kind of session an attendance record belongs to — `regular` is the child's own group,
 * `make-up` a class they sat with another.
 *
 * A database enum on the API side, so these are the only values the column accepts: the old varchar
 * defaulted to `'normal'`, which the service never wrote and the frontend could not render, so any
 * row created outside `createAttendance` showed up with an empty session type.
 *
 * **A union of literals here, not an enum**, like `ClassSessionStatus` since E12/S2 and for the
 * same reason: this package is CommonJS, Vite pre-bundles it, and an enum exported from here has
 * arrived in the browser with its body dropped and its export line intact — `undefined`, silently,
 * because the comparison throws inside a `computed` and Vue drops the subtree without a word. What
 * compares against these values — the attendance calendar, the admin's per-child table and the
 * parent's dashboard — gets `MarkType` from `apps/web/app/types/attendance.types.ts`, where the
 * Romanian labels live too.
 */
export type AttendanceType = 'regular' | 'make-up';

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

/**
 * One row of a class's register, as the tap-to-mark screen reads it — E12/S6.
 *
 * `present` is three-valued on purpose: `null` is "nobody has said yet", which is a different fact
 * from absent. `parentPhone` is here so an unannounced absence is one tap from a call — the S7
 * detail — and `null` when the profile has no phone, so the screen shows nothing rather than a
 * button that dials nowhere.
 */
export interface SessionRegisterEntry {
    childId: number;
    firstName: string;
    lastName: string;
    parentPhone: string | null;
    type: AttendanceType;
    present: boolean | null;
    attendanceId: number | null;
    /**
     * What the family announced ahead of the class, if they did — E12/S3. `null` means silence,
     * which is a different fact from "announced and turned up anyway".
     */
    announcedAbsence: { reason: string; inTime: boolean } | null;
}

/**
 * The whole register of one class, in one payload — session, children, existing marks.
 *
 * One request instead of four, because the caller is a phone in a classroom on whatever signal
 * reaches it.
 */
export interface SessionRegister {
    session: {
        id: number;
        date: ISODate;
        startTime: TimeOfDay;
        endTime: TimeOfDay;
        status: ClassSessionStatus;
        groupId: number;
        groupName: string;
        /** The vacation tick, editable from this screen — E12/S8. */
        isVacation: boolean;
    };
    entries: SessionRegisterEntry[];
}

/**
 * A parent saying, in advance, that their child will miss one class — E12/S3.
 *
 * Announcing does not mark anybody absent: the register stays the teacher's to take, and a child
 * whose parent announced can turn up anyway. `inTime` is frozen when the notice is written —
 * whether the family met the deadline is a fact about the moment of announcing, not a question
 * re-asked later.
 */
export interface AbsenceNotice {
    id: number;
    reason: string;
    /** True when it arrived before Monday noon of the class's own week (E12/S3). */
    inTime: boolean;
    createdAt: ISODateTime;
    child: { id: number; firstName: string; lastName: string };
    classSession: ClassSession;
    /**
     * The class the office moved the child into instead, for that week — E12/S4.
     *
     * **This is the whole of the make-up.** There is no credit and no expiry: an announced absence
     * is either placed into another group's class in the same week, by an admin, or it is not made
     * up at all. `null` reads as "not yet" while that week is still ahead and as "it did not happen"
     * once it has passed, and the calendar is what tells them apart.
     */
    replacementSession: ClassSession | null;
}

export interface AnnounceAbsenceDto {
    childId: number;
    classSessionId: number;
    reason: string;
}

/** One class a child could be moved into, as the office's screen reads it — E12/S4. */
export interface ReplacementOption {
    sessionId: number;
    date: ISODate;
    startTime: TimeOfDay;
    endTime: TimeOfDay;
    groupId: number;
    groupName: string;
    locationName: string | null;
    /** Seats free at that hour: the group's capacity less enrolments and visitors already moved in. */
    free: number;
}

export interface PlaceReplacementDto {
    classSessionId: number;
}
