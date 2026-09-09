import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dayKey, daysSince } from "~/composables/useUtils";

/**
 * The one-day error, pinned.
 *
 * `toISOString().slice(0, 10)` is the **UTC** day, and Romania is ahead of UTC all year — so
 * between midnight and 03:00 it names yesterday. Four screens read it that way: a school holiday
 * that ended last night still counted as running, the public booking form offered a date already
 * gone, the erasure queue counted a family as having waited a day less than they had, and the
 * family's own downloaded file was named for the wrong day.
 *
 * The tests below are written against a fixed instant in the window where the two answers differ,
 * because outside it every implementation agrees and the suite would pass on the bug.
 */
describe("dayKey", () => {
  /**
   * Pinned to the school's own zone, because in UTC the two answers are identical and the test
   * would pass on the bug. CI runs in UTC; the office does not.
   */
  const original = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "Europe/Bucharest";
  });
  afterAll(() => {
    process.env.TZ = original;
  });

  /** 22:30 UTC on the 9th is already 01:30 on the 10th in Bucharest. */
  const smallHours = new Date("2026-09-09T22:30:00Z");

  it("names the local day where the UTC one is still yesterday", () => {
    expect(dayKey(smallHours)).toBe("2026-09-10");
    expect(smallHours.toISOString().slice(0, 10)).toBe("2026-09-09");
  });

  it("pads a single-digit month and day", () => {
    expect(dayKey(new Date(2026, 0, 5, 12, 0, 0))).toBe("2026-01-05");
  });

  it("counts the small hours as a day already waited", () => {
    // The erasure queue's reading: requested at 09:00 on the 9th, opened at 01:30 on the 10th.
    expect(daysSince(new Date("2026-09-09T06:00:00Z"), smallHours)).toBe(1);
  });
});

describe("daysSince", () => {
  const at = (iso: string) => new Date(iso);

  it("counts mornings, not blocks of 24 hours", () => {
    // Recorded yesterday at 18:00, read today at 09:00: one day, which is what „ieri" means.
    expect(daysSince(at("2026-09-08T18:00:00"), at("2026-09-09T09:00:00"))).toBe(1);
    // The elapsed-milliseconds answer would be 0, and that is the bug this replaces.
    expect(daysSince(at("2026-09-09T09:00:00"), at("2026-09-09T23:59:00"))).toBe(0);
  });

  it("counts across a month boundary", () => {
    expect(daysSince(at("2026-08-31T10:00:00"), at("2026-09-02T08:00:00"))).toBe(2);
  });

  /** A row dated in the future has not been waiting; the queue shows „azi", not a negative number. */
  it("floors at zero", () => {
    expect(daysSince(at("2026-09-11T10:00:00"), at("2026-09-09T10:00:00"))).toBe(0);
  });

  it("answers zero for nothing at all, rather than NaN", () => {
    expect(daysSince(null)).toBe(0);
    expect(daysSince(undefined)).toBe(0);
    expect(daysSince("not a date")).toBe(0);
  });

  it("accepts the ISO instant the API sends", () => {
    expect(daysSince("2026-09-07T05:00:00.000Z", at("2026-09-09T12:00:00"))).toBe(2);
  });
});
