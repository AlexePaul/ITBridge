import { describe, expect, it } from "vitest";
import { CalendarDate, CalendarDateTime, parseZonedDateTime } from "@internationalized/date";
import { DATE_KEY_PATTERN, calendarToDateKey, dateKeyToCalendar } from "~/composables/useDateField";

/**
 * The crossing between a form's `YYYY-MM-DD` state and the calendar widgets — E18/S5b.
 *
 * Both directions work from string and value components alone. `new Date('2026-08-29')` is
 * midnight UTC and reads back as the 28th east of Greenwich, where the school is; the child forms
 * used to produce their payload through `toISOString()` and were one timezone away from saving
 * every birthday a day early. These tests hold that neither function needs a `Date` to agree
 * with itself.
 */
describe("dateKeyToCalendar", () => {
  it("reads the calendar day from the string components", () => {
    const value = dateKeyToCalendar("2018-03-16");
    expect(value).toBeInstanceOf(CalendarDate);
    expect([value?.year, value?.month, value?.day]).toEqual([2018, 3, 16]);
  });

  it("takes a timestamp's date part and ignores the rest, like formatDateKey", () => {
    expect(dateKeyToCalendar("2026-03-12T10:00:00.000Z")?.toString()).toBe("2026-03-12");
  });

  it("answers undefined for nothing, so an empty field stays empty", () => {
    expect(dateKeyToCalendar(undefined)).toBeUndefined();
    expect(dateKeyToCalendar(null)).toBeUndefined();
    expect(dateKeyToCalendar("")).toBeUndefined();
  });

  it("refuses what is not a day key instead of guessing", () => {
    expect(dateKeyToCalendar("16.03.2018")).toBeUndefined();
    expect(dateKeyToCalendar("2018-3-6")).toBeUndefined();
    expect(dateKeyToCalendar("azi")).toBeUndefined();
  });

  it("refuses an impossible date rather than clamping it to a real one", () => {
    expect(dateKeyToCalendar("2026-02-30")).toBeUndefined();
    expect(dateKeyToCalendar("2026-13-01")).toBeUndefined();
    expect(dateKeyToCalendar("2024-02-29")?.toString()).toBe("2024-02-29");
  });
});

describe("calendarToDateKey", () => {
  it("prints the key from the value's components, padded", () => {
    expect(calendarToDateKey(new CalendarDate(2018, 3, 6))).toBe("2018-03-06");
  });

  it("round-trips with dateKeyToCalendar", () => {
    expect(calendarToDateKey(dateKeyToCalendar("2018-03-16"))).toBe("2018-03-16");
  });

  it("keeps the date part of a date-time value, in its own day", () => {
    expect(calendarToDateKey(new CalendarDateTime(2026, 9, 6, 23, 30))).toBe("2026-09-06");
    // 00:30 in Bucharest is 21:30 UTC of the day before; the key is the day the school sees.
    expect(calendarToDateKey(parseZonedDateTime("2026-09-06T00:30[Europe/Bucharest]"))).toBe(
      "2026-09-06"
    );
  });

  it("answers undefined for nothing, so clearing the field clears the state", () => {
    expect(calendarToDateKey(undefined)).toBeUndefined();
    expect(calendarToDateKey(null)).toBeUndefined();
  });
});

describe("DATE_KEY_PATTERN", () => {
  it("matches a day key and nothing looser", () => {
    expect(DATE_KEY_PATTERN.test("2018-03-16")).toBe(true);
    expect(DATE_KEY_PATTERN.test("2018-3-16")).toBe(false);
    expect(DATE_KEY_PATTERN.test("2018-03-16T00:00:00.000Z")).toBe(false);
    expect(DATE_KEY_PATTERN.test("")).toBe(false);
  });
});
