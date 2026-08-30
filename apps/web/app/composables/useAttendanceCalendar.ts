import type { Attendance } from "~/types/attendance.types";
import { AttendanceType } from "~/types/attendance.types";
import type { ClassSession, ClassSessionWithAttendance } from "~/types/class-session.types";
import { ClassSessionStatus } from "~/types/class-session.types";

/**
 * What one day of a child's calendar actually says.
 *
 * This used to be guessed from `Group.weekday`: any past day whose weekday matched the group's and
 * carried no attendance record was painted red. With no source for "was there a class that day?",
 * guessing was the only thing available - and it told every parent their child had been absent from
 * every Monday since the group was created, holidays and months before enrolment included.
 *
 * `ClassSession` answers the question exactly, so nothing here is inferred from a weekday.
 */
export type CalendarDayState =
  /** A class is on the timetable and has not happened yet. */
  | "planned"
  /** The register was taken and the child was there. */
  | "present"
  /** The register was taken and the child was not there. */
  | "absent"
  /**
   * The class happened, but nobody took the register.
   *
   * Its own state on purpose. Folding it into `absent` is the lie this whole screen exists to stop:
   * a missing record says something about the school's paperwork, not about the child.
   */
  | "unmarked"
  /** The child sat in on a catch-up class with another group. */
  | "make-up";

/** Chip colours, in @nuxt/ui terms. `info` is the blue that separates "unmarked" from "absent". */
export const CALENDAR_DAY_COLORS = {
  planned: "neutral",
  present: "success",
  absent: "error",
  unmarked: "info",
  "make-up": "warning",
} as const satisfies Record<CalendarDayState, string>;

export type CalendarDayColor = (typeof CALENDAR_DAY_COLORS)[CalendarDayState];

/** A calendar day, as `@internationalized/date` hands it to the `#day` slot. */
export interface CalendarDayParts {
  year: number;
  month: number;
  day: number;
}

export interface CalendarDayInput {
  /** The day being painted, `YYYY-MM-DD` - the same shape as `ClassSession.date`. */
  date: string;
  /** Today, in the same shape. Passed in rather than read, so this stays a pure function. */
  today: string;
  /** Every attendance record the child has, in any group. */
  attendance: Attendance[];
  /** The timetable of the child's own group. */
  sessions: ClassSessionWithAttendance[];
}

/**
 * `YYYY-MM-DD` from local calendar components, never `toISOString().slice(0, 10)`.
 *
 * `ClassSession.date` is a bare date with no timezone, and UTC midnight is the previous day for
 * everyone west of Greenwich - so a UTC round-trip slides a Monday class onto Sunday. Comparing
 * these strings avoids `Date` entirely: they sort and compare lexicographically as dates.
 */
export function toDateKey({ year, month, day }: CalendarDayParts): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Today as a day key, in the browser's own timezone. */
export function todayKey(now: Date = new Date()): string {
  return toDateKey({ year: now.getFullYear(), month: now.getMonth() + 1, day: now.getDate() });
}

/**
 * A cancelled class is not a class.
 *
 * The API returns cancelled sessions in the list rather than filtering them out, because an admin
 * needs to see that the slot exists and why (`notes` carries the reason). A parent does not: no
 * class happened, nobody could be present or absent, so the day gets no dot at all - the same as a
 * day the group never meets.
 */
function countsAsClass(session: Pick<ClassSession, "status">): boolean {
  return session.status !== ClassSessionStatus.CANCELLED;
}

/**
 * The one record that describes the child's day.
 *
 * A regular mark wins over a catch-up one: on the rare day a child both attends their own class and
 * sits in on another group's, the own class is the one the calendar is about.
 */
function recordFor(attendance: Attendance[], date: string): Attendance | undefined {
  const onDay = attendance.filter((record) => record.classSession?.date === date);
  return onDay.find((record) => record.type === AttendanceType.REGULAR) ?? onDay[0];
}

/**
 * The state of a single day, from records and the timetable - never from the weekday.
 *
 * Order matters. An attendance record is checked first because the record itself proves a class
 * happened: a child who has changed groups keeps the marks from the old one, and those sessions are
 * not in `sessions`, which only ever holds the current group's timetable.
 */
export function calendarDayState({
  date,
  today,
  attendance,
  sessions,
}: CalendarDayInput): CalendarDayState | undefined {
  const record = recordFor(attendance, date);

  if (record && countsAsClass(record.classSession)) {
    if (record.type === AttendanceType.MAKE_UP) {
      // A catch-up the child turned up to is its own thing, and yellow says so. One they were
      // booked for and missed is a real, recorded absence, so it is red like any other.
      return record.present ? "make-up" : "absent";
    }
    return record.present ? "present" : "absent";
  }

  const session = sessions.find((candidate) => candidate.date === date && countsAsClass(candidate));
  if (!session) return undefined;

  // Today counts as "planned", not "unmarked": the class may not have finished yet, and the
  // reminder that chases a forgotten register only goes out the next morning.
  if (session.date >= today) return "planned";

  // Past, and this child has no mark. `hasAttendance` is deliberately not consulted here - it says
  // whether *somebody* was marked for the class, which does not make this child marked: a child who
  // joined the group later has no row for the classes before they arrived.
  return "unmarked";
}

/** The same answer as a chip colour, or `undefined` for a day that gets no dot. */
export function calendarDayColor(input: CalendarDayInput): CalendarDayColor | undefined {
  const state = calendarDayState(input);
  return state && CALENDAR_DAY_COLORS[state];
}
