import { describe, expect, it } from "vitest";
import {
  NO_WINDOWS_SENTENCE,
  dayLabel,
  groupWindowsByDay,
  rescheduleStateSentence,
  weekLabel,
  windowKey,
  windowLabel,
} from "~/composables/useRescheduleWindows";
import type { RescheduleWindow, RescheduleWindows } from "~/types/class-session.types";

/**
 * The wording of the "recuperează ora" dialog — E12/S9. The sentence above the list depends on
 * which of three states the class is in and on whether the calendar closed the day, and those
 * four sentences are the part of the screen most likely to say something untrue.
 */

const window = (overrides: Partial<RescheduleWindow> = {}): RescheduleWindow => ({
  date: "2027-04-06",
  startTime: "16:00",
  endTime: "17:30",
  roomId: 1,
  roomName: "Sala 1",
  locationName: "Drumul Taberei",
  ...overrides,
});

const result = (overrides: Partial<RescheduleWindows> = {}): RescheduleWindows => ({
  week: { from: "2027-04-05", to: "2027-04-11" },
  missedDate: "2027-04-05",
  missedDayClosed: false,
  usual: { startTime: "16:00", endTime: "17:30", roomId: 1, roomName: "Sala 1" },
  source: null,
  blocked: null,
  windows: [],
  ...overrides,
});

describe("dayLabel", () => {
  it("names the weekday, because another day is what is being chosen", () => {
    expect(dayLabel("2027-04-06")).toBe("marți, 6 aprilie");
  });

  it("hands back what it cannot read", () => {
    expect(dayLabel("nu-e-o-zi")).toBe("nu-e-o-zi");
  });
});

describe("weekLabel", () => {
  it("collapses a week inside one month", () => {
    expect(weekLabel({ from: "2027-04-05", to: "2027-04-11" })).toBe("5–11 aprilie 2027");
  });

  it("spells both ends when the week straddles a month", () => {
    expect(weekLabel({ from: "2027-03-29", to: "2027-04-04" })).toBe("29 martie – 4 aprilie 2027");
  });
});

describe("groupWindowsByDay", () => {
  it("folds consecutive windows of one day together, in the order given", () => {
    const days = groupWindowsByDay([
      window(),
      window({ roomId: 2, roomName: "Sala 2" }),
      window({ date: "2027-04-07" }),
    ]);

    expect(days.map((day) => day.date)).toEqual(["2027-04-06", "2027-04-07"]);
    expect(days[0]?.label).toBe("marți, 6 aprilie");
    expect(days[0]?.windows.map((w) => w.roomId)).toEqual([1, 2]);
    expect(days[1]?.windows).toHaveLength(1);
  });

  it("is empty for an empty list", () => {
    expect(groupWindowsByDay([])).toEqual([]);
  });
});

describe("windowLabel and windowKey", () => {
  it("reads as hour and room", () => {
    expect(windowLabel(window())).toBe("16:00–17:30 · Sala 1");
  });

  it("keys on the triple that makes a window a window", () => {
    expect(windowKey(window())).toBe("2027-04-06T16:00@1");
    expect(windowKey(window({ roomId: 2 }))).not.toBe(windowKey(window()));
  });
});

describe("rescheduleStateSentence", () => {
  it("says a never-generated class is missing because the calendar closed the day", () => {
    expect(rescheduleStateSentence(result({ missedDayClosed: true }))).toBe(
      "Ora de luni, 5 aprilie nu a fost generată — ziua e în calendarul școlar."
    );
  });

  it("says a never-generated class on an open day simply was not generated", () => {
    expect(rescheduleStateSentence(result())).toBe(
      "Ora de luni, 5 aprilie nu e în orar — nu a fost generată încă."
    );
  });

  it("says a cancelled class is cancelled, and why when the calendar did it", () => {
    const source = {
      id: 3,
      status: "cancelled" as const,
      hasAttendance: false,
      startTime: "16:00",
      endTime: "17:30",
      roomId: 1,
      roomName: "Sala 1",
      notes: "Anulată automat: Paște",
    };

    expect(rescheduleStateSentence(result({ source, missedDayClosed: true }))).toBe(
      "Ora de luni, 5 aprilie e anulată — ziua e în calendarul școlar."
    );
    expect(rescheduleStateSentence(result({ source }))).toBe("Ora de luni, 5 aprilie e anulată.");
  });

  it("says a scheduled class will move", () => {
    const source = {
      id: 3,
      status: "scheduled" as const,
      hasAttendance: false,
      startTime: "16:00",
      endTime: "17:30",
      roomId: 1,
      roomName: "Sala 1",
      notes: null,
    };

    expect(rescheduleStateSentence(result({ source }))).toBe(
      "Ora de luni, 5 aprilie, 16:00, e programată — se mută în fereastra aleasă."
    );
  });

  it("lets the API's own reason win when the class cannot be recovered", () => {
    expect(
      rescheduleStateSentence(
        result({ blocked: { code: "CLASS_SESSION_HAS_ATTENDANCE", message: "Ora s-a ținut." } })
      )
    ).toBe("Ora s-a ținut.");
  });

  it("has a sentence for a week with nothing free that does not blame anyone", () => {
    expect(NO_WINDOWS_SENTENCE).toContain("cu o ședință mai puțin");
  });
});
