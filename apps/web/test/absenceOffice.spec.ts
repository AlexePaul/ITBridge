import { describe, expect, it } from "vitest";
import {
  NOTICE_STATE_COLORS,
  NOTICE_STATE_LABELS,
  addDaysToKey,
  announceableSessions,
  childChoiceLabel,
  classLabel,
  freeSeatsLabel,
  groupNoticesByWeek,
  groupOptionsByDay,
  isSlipping,
  moveSentence,
  noticeState,
  optionLabel,
  sessionChoiceLabel,
  weekOf,
} from "~/composables/useAbsenceOffice";
import type { AbsenceNotice, ReplacementOption } from "~/types/attendance.types";
import type { ClassSession } from "~/types/class-session.types";

/**
 * The office's absences screen — E12/S3 and S4. Two things here can quietly say something untrue:
 * the week a class is folded under, which is read from a `YYYY-MM-DD` and is off by one day the
 * moment anybody parses it through UTC; and the state of a notice, which is two frozen facts and
 * must never be re-judged against today's clock.
 */

const session = (overrides: Partial<ClassSession> = {}): ClassSession =>
  ({
    id: 9,
    date: "2026-09-08",
    startTime: "17:00:00",
    endTime: "18:30:00",
    status: "scheduled",
    notes: null,
    isVacation: false,
    group: { id: 3, name: "Scratch" },
    room: { id: 1, name: "Sala 1", location: { id: 1, name: "Drumul Taberei" } },
    ...overrides,
  }) as ClassSession;

const notice = (overrides: Partial<AbsenceNotice> = {}): AbsenceNotice => ({
  id: 1,
  reason: "Răcit",
  inTime: true,
  createdAt: "2026-09-07T08:00:00.000Z",
  child: { id: 5, firstName: "Ana", lastName: "Pop" },
  classSession: session(),
  replacementSession: null,
  ...overrides,
});

const option = (overrides: Partial<ReplacementOption> = {}): ReplacementOption => ({
  sessionId: 20,
  date: "2026-09-10",
  startTime: "18:00:00",
  endTime: "19:30:00",
  groupId: 4,
  groupName: "Python",
  locationName: "Titan",
  free: 2,
  ...overrides,
});

describe("weekOf", () => {
  it("bounds a Tuesday by its own Monday and Sunday", () => {
    expect(weekOf("2026-09-08")).toEqual({ from: "2026-09-07", to: "2026-09-13" });
  });

  it("puts a Sunday at the end of its week, not at the start of the next", () => {
    expect(weekOf("2026-09-13")).toEqual({ from: "2026-09-07", to: "2026-09-13" });
  });

  it("crosses a month boundary from components, not through UTC", () => {
    expect(weekOf("2026-10-01")).toEqual({ from: "2026-09-28", to: "2026-10-04" });
  });

  it("hands back what it cannot read", () => {
    expect(weekOf("nu-e-o-zi")).toEqual({ from: "nu-e-o-zi", to: "nu-e-o-zi" });
  });
});

describe("addDaysToKey", () => {
  it("steps over a month end", () => {
    expect(addDaysToKey("2026-09-29", 3)).toBe("2026-10-02");
  });
});

describe("groupNoticesByWeek", () => {
  it("folds by the Monday of the missed class and labels the week", () => {
    const weeks = groupNoticesByWeek([
      notice({ id: 1, classSession: session({ date: "2026-09-08" }) }),
      notice({ id: 2, classSession: session({ date: "2026-09-12" }) }),
      notice({ id: 3, classSession: session({ date: "2026-09-15" }) }),
    ]);
    expect(weeks.map((week) => week.week.from)).toEqual(["2026-09-07", "2026-09-14"]);
    expect(weeks[0]!.label).toBe("7–13 septembrie 2026");
    expect(weeks[0]!.notices.map((row) => row.id)).toEqual([1, 2]);
    expect(weeks[1]!.notices.map((row) => row.id)).toEqual([3]);
  });

  it("keeps one week together even when the rows are not adjacent", () => {
    const weeks = groupNoticesByWeek([
      notice({ id: 1, classSession: session({ date: "2026-09-08" }) }),
      notice({ id: 2, classSession: session({ date: "2026-09-15" }) }),
      notice({ id: 3, classSession: session({ date: "2026-09-12" }) }),
    ]);
    expect(weeks).toHaveLength(2);
    expect(weeks[0]!.notices.map((row) => row.id)).toEqual([1, 3]);
  });

  it("is empty for nothing", () => {
    expect(groupNoticesByWeek([])).toEqual([]);
  });
});

describe("labels", () => {
  it("names the class the way the office says it on the phone", () => {
    expect(classLabel(session())).toBe("marți, 8 septembrie, 17:00");
  });

  it("offers a class with both ends of the hour", () => {
    expect(sessionChoiceLabel(session())).toBe("marți, 8 septembrie · 17:00–18:30");
  });

  it("names the child with the group, and without one when there is none", () => {
    expect(
      childChoiceLabel({ firstName: "Ana", lastName: "Pop", group: { name: "Scratch" } as never })
    ).toBe("Ana Pop · Scratch");
    expect(childChoiceLabel({ firstName: "Ana", lastName: "Pop", group: null })).toBe("Ana Pop");
  });

  it("counts seats in Romanian", () => {
    expect(freeSeatsLabel(1)).toBe("1 loc liber");
    expect(freeSeatsLabel(3)).toBe("3 locuri libere");
  });

  it("describes an option with the location only when the API knows it", () => {
    expect(optionLabel(option())).toBe("18:00–19:30 · Python · Titan");
    expect(optionLabel(option({ locationName: null }))).toBe("18:00–19:30 · Python");
  });
});

describe("announceableSessions", () => {
  it("keeps today and later, drops the cancelled, and orders by day then hour", () => {
    const rows = announceableSessions(
      [
        session({ id: 1, date: "2026-09-10", startTime: "18:00:00" }),
        session({ id: 2, date: "2026-09-06" }),
        session({ id: 3, date: "2026-09-10", startTime: "16:00:00" }),
        session({ id: 4, date: "2026-09-12", status: "cancelled" }),
        session({ id: 5, date: "2026-09-07" }),
      ],
      "2026-09-07"
    );
    expect(rows.map((row) => row.id)).toEqual([5, 3, 1]);
  });
});

describe("groupOptionsByDay", () => {
  it("folds by day in the order received and labels the weekday", () => {
    const days = groupOptionsByDay([
      option({ sessionId: 1, date: "2026-09-10" }),
      option({ sessionId: 2, date: "2026-09-10", startTime: "19:00:00" }),
      option({ sessionId: 3, date: "2026-09-12" }),
    ]);
    expect(days.map((day) => day.label)).toEqual(["joi, 10 septembrie", "sâmbătă, 12 septembrie"]);
    expect(days[0]!.options.map((row) => row.sessionId)).toEqual([1, 2]);
  });
});

describe("noticeState", () => {
  it("reads the two frozen facts and nothing else", () => {
    expect(noticeState(notice())).toBe("waiting");
    expect(noticeState(notice({ inTime: false }))).toBe("late");
    expect(noticeState(notice({ inTime: false, replacementSession: session() }))).toBe("placed");
  });

  it("has a label and a colour for every state", () => {
    for (const state of ["placed", "waiting", "late"] as const) {
      expect(NOTICE_STATE_LABELS[state]).toBeTruthy();
      expect(NOTICE_STATE_COLORS[state]).toBeTruthy();
    }
  });
});

describe("moveSentence", () => {
  it("names the group, the day and hour, and the address — in the order the email does", () => {
    const moved = notice({
      replacementSession: session({
        date: "2026-09-10",
        startTime: "18:00:00",
        group: { id: 4, name: "Python" } as never,
      }),
    });
    expect(moveSentence(moved)).toBe(
      "Ana merge la grupa Python, joi, 10 septembrie, 18:00, la Drumul Taberei."
    );
  });

  it("leaves the address out when the class has none, and says nothing for an unplaced notice", () => {
    const moved = notice({
      replacementSession: session({
        room: undefined as never,
        group: { id: 4, name: "Python" } as never,
      }),
    });
    expect(moveSentence(moved)).toBe("Ana merge la grupa Python, marți, 8 septembrie, 17:00.");
    expect(moveSentence(notice())).toBe("");
  });
});

describe("isSlipping", () => {
  it("flags an in-time notice whose class is today or gone and still has no move", () => {
    expect(
      isSlipping(notice({ classSession: session({ date: "2026-09-08" }) }), "2026-09-08")
    ).toBe(true);
    expect(
      isSlipping(notice({ classSession: session({ date: "2026-09-08" }) }), "2026-09-09")
    ).toBe(true);
  });

  it("does not flag one still ahead, one already placed, or one announced late", () => {
    expect(
      isSlipping(notice({ classSession: session({ date: "2026-09-10" }) }), "2026-09-08")
    ).toBe(false);
    expect(isSlipping(notice({ replacementSession: session() }), "2026-09-09")).toBe(false);
    expect(isSlipping(notice({ inTime: false }), "2026-09-09")).toBe(false);
  });
});
