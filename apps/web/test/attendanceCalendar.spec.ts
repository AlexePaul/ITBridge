import { describe, expect, it } from "vitest";
import {
  CALENDAR_DAY_COLORS,
  calendarDayColor,
  calendarDayState,
  monthGrid,
  toDateKey,
  todayKey,
} from "~/composables/useAttendanceCalendar";
import type { Attendance } from "~/types/attendance.types";
import { AttendanceType } from "~/types/attendance.types";
import type { ClassSessionWithAttendance } from "~/types/class-session.types";
import { SessionStatus } from "~/types/class-session.types";

/**
 * The bug this replaces, in one sentence: the calendar decided a class had happened by comparing
 * the day of the week against `Group.weekday`, so every Monday for the rest of the parent's life
 * was drawn as an absence. The rule is now read off `ClassSession`, and these tests pin down the
 * one distinction the old code could not make - "nobody took the register" is not "absent".
 */

const TODAY = "2026-08-29";

const session = (
  date: string,
  overrides: Partial<ClassSessionWithAttendance> = {}
): ClassSessionWithAttendance =>
  ({
    id: 1,
    group: { id: 10, name: "Scratch Începători", weekday: 1 },
    date,
    startTime: "16:00:00",
    endTime: "17:30:00",
    room: { id: 1, name: "Sala 1" },
    status: SessionStatus.SCHEDULED,
    notes: null,
    hasAttendance: false,
    ...overrides,
  }) as ClassSessionWithAttendance;

const mark = (
  date: string,
  present: boolean,
  type: AttendanceType = AttendanceType.REGULAR,
  sessionOverrides: Partial<ClassSessionWithAttendance> = {}
): Attendance =>
  ({
    id: 100,
    classSession: session(date, sessionOverrides),
    group: { id: 10 },
    type,
    present,
  }) as Attendance;

const stateOn = (
  date: string,
  attendance: Attendance[] = [],
  sessions: ClassSessionWithAttendance[] = []
) => calendarDayState({ date, today: TODAY, attendance, sessions });

describe("calendarDayState", () => {
  it("paints nothing on a day the group has no class", () => {
    // The old code's failure, exactly: a Monday in August, no session anywhere near it.
    expect(stateOn("2026-08-03", [], [session("2026-05-04")])).toBeUndefined();
  });

  it("paints nothing on a day with no class even when the weekday matches the group's", () => {
    const sessions = [session("2026-05-04")]; // also a Monday, months earlier
    expect(stateOn("2026-08-24", [], sessions)).toBeUndefined();
  });

  it("marks a class still to come as planned", () => {
    expect(stateOn("2026-09-07", [], [session("2026-09-07")])).toBe("planned");
  });

  it("counts today's class as planned, not as a forgotten register", () => {
    expect(stateOn(TODAY, [], [session(TODAY)])).toBe("planned");
  });

  it("marks a past class the child attended as present", () => {
    const date = "2026-08-17";
    expect(stateOn(date, [mark(date, true)], [session(date, { hasAttendance: true })])).toBe(
      "present"
    );
  });

  it("marks a past class the child missed as absent", () => {
    const date = "2026-08-17";
    expect(stateOn(date, [mark(date, false)], [session(date, { hasAttendance: true })])).toBe(
      "absent"
    );
  });

  it("marks a past class nobody took the register for as unmarked, never as absent", () => {
    const date = "2026-08-17";
    const state = stateOn(date, [], [session(date, { hasAttendance: false })]);
    expect(state).toBe("unmarked");
    expect(state).not.toBe("absent");
  });

  it("keeps a past class unmarked for a child with no row, even once someone else was marked", () => {
    // `hasAttendance` is about the class, not about this child: a child who joined the group later
    // has no row for the classes before they arrived.
    const date = "2026-08-17";
    expect(stateOn(date, [], [session(date, { hasAttendance: true })])).toBe("unmarked");
  });

  it("marks a catch-up the child turned up to, on a day their own group does not meet", () => {
    const date = "2026-08-19";
    const catchUp = mark(date, true, AttendanceType.MAKE_UP, { group: { id: 20 } as never });
    expect(stateOn(date, [catchUp], [])).toBe("make-up");
  });

  it("marks a catch-up the child was booked for and missed as absent", () => {
    const date = "2026-08-19";
    const catchUp = mark(date, false, AttendanceType.MAKE_UP, { group: { id: 20 } as never });
    expect(stateOn(date, [catchUp], [])).toBe("absent");
  });

  it("prefers the child's own class over a catch-up sat on the same day", () => {
    const date = "2026-08-17";
    const catchUp = mark(date, true, AttendanceType.MAKE_UP, { group: { id: 20 } as never });
    const own = { ...mark(date, false), id: 101 };
    expect(stateOn(date, [catchUp, own], [session(date)])).toBe("absent");
  });

  it("paints nothing on a cancelled class: no class happened, so nobody was absent from it", () => {
    const date = "2026-08-17";
    const cancelled = session(date, {
      status: SessionStatus.CANCELLED,
      notes: "Anulată: profesor bolnav",
    });
    expect(stateOn(date, [], [cancelled])).toBeUndefined();
  });

  it("paints nothing on a cancelled class in the future either", () => {
    const cancelled = session("2026-09-07", { status: SessionStatus.CANCELLED });
    expect(stateOn("2026-09-07", [], [cancelled])).toBeUndefined();
  });

  it("still reports a mark from the group the child has since left", () => {
    // The record carries its own session, so it survives a group change; `sessions` only ever
    // holds the current group's timetable.
    const date = "2026-04-13";
    const old = mark(date, true, AttendanceType.REGULAR, { group: { id: 99 } as never });
    expect(stateOn(date, [old], [])).toBe("present");
  });

  it("paints nothing for a child with no group and no marks at all", () => {
    expect(stateOn("2026-08-17", [], [])).toBeUndefined();
  });
});

describe("calendarDayColor", () => {
  it("maps every state to a chip colour, and unmarked to something other than error", () => {
    expect(CALENDAR_DAY_COLORS.present).toBe("success");
    expect(CALENDAR_DAY_COLORS.absent).toBe("error");
    expect(CALENDAR_DAY_COLORS.unmarked).toBe("info");
    expect(CALENDAR_DAY_COLORS.unmarked).not.toBe(CALENDAR_DAY_COLORS.absent);
    expect(CALENDAR_DAY_COLORS.planned).toBe("neutral");
    expect(CALENDAR_DAY_COLORS["make-up"]).toBe("warning");
  });

  it("returns undefined for a day with no dot, so the chip stays hidden", () => {
    expect(
      calendarDayColor({ date: "2026-08-03", today: TODAY, attendance: [], sessions: [] })
    ).toBeUndefined();
  });

  it("returns the colour of the state it wraps", () => {
    const date = "2026-08-17";
    expect(
      calendarDayColor({
        date,
        today: TODAY,
        attendance: [],
        sessions: [session(date)],
      })
    ).toBe("info");
  });
});

describe("toDateKey", () => {
  it("pads month and day, so the keys compare as dates", () => {
    expect(toDateKey({ year: 2026, month: 3, day: 7 })).toBe("2026-03-07");
  });

  it("builds the same key a session carries, with no Date and no timezone in between", () => {
    expect(toDateKey({ year: 2026, month: 8, day: 17 })).toBe(session("2026-08-17").date);
  });

  it("reads today from local components, not from a UTC round-trip", () => {
    // 00:30 local on 1 March is still 28 February in UTC anywhere west of Greenwich; a
    // `toISOString().slice(0, 10)` here would slide the whole calendar back a day.
    const localMidnightish = new Date(2026, 2, 1, 0, 30);
    expect(todayKey(localMidnightish)).toBe("2026-03-01");
  });
});

describe("monthGrid", () => {
  it("always draws six weeks, so paging through the year never resizes the grid", () => {
    // February 2027 is 28 days starting on a Monday - the shortest possible month, perfectly
    // aligned. It still gets 42 cells.
    expect(monthGrid(2027, 2)).toHaveLength(42);
    expect(monthGrid(2026, 8)).toHaveLength(42);
  });

  it("starts on the Monday of the week the 1st falls in", () => {
    // 1 September 2026 is a Tuesday, so the grid opens on Monday 31 August.
    const grid = monthGrid(2026, 9);
    expect(grid[0]).toEqual({ date: "2026-08-31", day: 31, inMonth: false });
    expect(grid[1]).toEqual({ date: "2026-09-01", day: 1, inMonth: true });
  });

  it("opens on the 1st when the month already starts on a Monday", () => {
    // 1 June 2026 is a Monday: no leading days at all.
    expect(monthGrid(2026, 6)[0]).toEqual({ date: "2026-06-01", day: 1, inMonth: true });
  });

  it("marks the trailing days of the next month as outside", () => {
    const grid = monthGrid(2026, 9);
    const last = grid[grid.length - 1]!;
    expect(last.inMonth).toBe(false);
    expect(last.date.startsWith("2026-10")).toBe(true);
  });

  it("holds every day of the month, once, in order", () => {
    const inside = monthGrid(2026, 9).filter((cell) => cell.inMonth);
    expect(inside).toHaveLength(30);
    expect(inside[0]!.date).toBe("2026-09-01");
    expect(inside[29]!.date).toBe("2026-09-30");
  });

  it("crosses a year boundary in both directions", () => {
    expect(monthGrid(2027, 1)[0]!.date.startsWith("2026-12")).toBe(true);
    const december = monthGrid(2026, 12);
    expect(december[december.length - 1]!.date.startsWith("2027-01")).toBe(true);
  });

  it("keeps January's leading days out of the month, not merely out of the number", () => {
    // The `inMonth` check compares the year as well as the month. Without that, 1 January's
    // leading days - December of the *previous* year - would compare equal on month alone in a
    // December grid and be drawn as though they belonged.
    expect(monthGrid(2027, 1).filter((cell) => cell.inMonth)).toHaveLength(31);
  });

  it("does not slide a day under a timezone east of Greenwich", () => {
    // The school is in Bucharest. A grid built from local components and formatted through UTC
    // comes back a day early there; these keys are built and read entirely in UTC, so they do not.
    const grid = monthGrid(2026, 3);
    expect(grid.filter((cell) => cell.inMonth)[0]!.date).toBe("2026-03-01");
  });
});
