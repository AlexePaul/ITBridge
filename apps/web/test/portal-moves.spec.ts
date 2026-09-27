import { describe, expect, it } from "vitest";
import {
  moveCardTail,
  movedClassNote,
  moveTodoText,
  weekdayInSentence,
} from "~/composables/usePortalMoves";
import type { AbsenceNotice } from "~/types/attendance.types";
import type { ClassSession } from "~/types/class-session.types";

/**
 * How the portal words a move (E12 S4) — the QA of 27 September 2026 found the sentences said three
 * untrue or wrong things: „în săptămâna asta" about a class nine days away, „L-am mutat" about a
 * girl, and „Marți 6 oct." with a capital in the middle of a sentence. Plus a stray space before a
 * comma on the moves card.
 */

const session = (overrides: Partial<ClassSession> = {}): ClassSession =>
  ({
    id: 9,
    date: "2026-09-29",
    startTime: "17:00:00",
    endTime: "18:30:00",
    status: "scheduled",
    notes: null,
    isVacation: false,
    group: { id: 3, name: "Scratch Începători" },
    room: { id: 1, name: "Sala 1", location: { id: 1, name: "Drumul Taberei" } },
    ...overrides,
  }) as ClassSession;

const notice = (overrides: Partial<AbsenceNotice> = {}): AbsenceNotice =>
  ({
    id: 4,
    reason: "Răcită",
    inTime: true,
    createdAt: "2026-09-27T08:00:00.000Z",
    child: { id: 7, firstName: "Maria", lastName: "Pop" },
    classSession: session(),
    replacementSession: session({
      id: 12,
      date: "2026-10-06",
      group: { id: 5, name: "Scratch Avansați" } as ClassSession["group"],
    }),
    ...overrides,
  }) as AbsenceNotice;

/** What gives the sentence a gender the platform does not know. */
const GENDERED = /l-am|mutat-o|mutată|îl așteptăm|o așteptăm|\bmutat\b/i;

describe("the weekday inside a sentence", () => {
  it("is lower case, as Romanian writes it", () => {
    expect(weekdayInSentence("2026-10-06")).toBe("marți");
    expect(weekdayInSentence("2026-10-03")).toBe("sâmbătă");
  });
});

describe("the note under the next class on Acasă", () => {
  it("names the class it replaces, which is true however far away the move is", () => {
    const note = movedClassNote(notice());
    expect(note).toContain("Scratch Avansați");
    expect(note).toContain("29 sept. 2026");
    expect(note).not.toMatch(/săptămâna asta/);
    expect(note).not.toMatch(GENDERED);
  });

  it("prints „altă grupă”, not „grupa alta”, when the class came without its group", () => {
    const note = movedClassNote(
      notice({ replacementSession: session({ id: 12, group: undefined }) })
    );
    expect(note).toContain("altă grupă");
    expect(note).not.toMatch(/grupa alta/);
  });
});

describe("the to-do on Acasă", () => {
  it("says where and when without a gender, with the weekday in lower case", () => {
    const text = moveTodoText(notice());
    expect(text).toContain("la grupa Scratch Avansați");
    expect(text).toContain("marți, 6 oct. 2026, ora 17:00");
    expect(text).not.toMatch(/Marți/);
    expect(text).not.toMatch(GENDERED);
    expect(text).not.toMatch(/săptămâna asta/);
  });
});

describe("the sentence on a move's card", () => {
  it("follows the group's name with a comma, not with a space and then a comma", () => {
    const tail = moveCardTail(notice(), "Sala 2 · Strada Valea Oltului 73 — Drumul Taberei");
    expect(tail).toBe(
      ", Sala 2 · Strada Valea Oltului 73 — Drumul Taberei, în locul orei din 29 sept. 2026."
    );
    expect(moveCardTail(notice(), "")).toBe(", în locul orei din 29 sept. 2026.");
  });
});
