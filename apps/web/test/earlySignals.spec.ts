import { describe, expect, it } from "vitest";
import {
  arrearsSentence,
  basisSentence,
  signalTiles,
  streakSentence,
  trendSentence,
} from "~/composables/useEarlySignals";
import { formatDateKey, formatLei, formatPercent } from "~/composables/useAdminFormat";
import type { ChildAbsenceSignal, EarlySignals } from "~/types/reports.types";

/**
 * The wording of the "Semnale" tab — E21/S7. What is held: the sentences name the thresholds the
 * API sent rather than ones the screen made up, and the Romanian nouns are counted right.
 */

const child = (overrides: Partial<ChildAbsenceSignal> = {}): ChildAbsenceSignal => ({
  childId: 100,
  childName: "Ana Pop",
  groupId: 7,
  groupName: "Scratch",
  parentId: 20,
  parentName: "Maria Pop",
  phone: "+40700000001",
  email: null,
  streak: 3,
  since: "2026-03-09",
  lastMarkOn: "2026-03-23",
  announced: 0,
  ...overrides,
});

const signals = (overrides: Partial<EarlySignals> = {}): EarlySignals => ({
  asOf: "2026-03-30",
  lookbackFrom: "2025-12-30",
  generatedOn: "2026-03-30",
  thresholds: {
    childAbsenceStreak: 3,
    staleStreakAfterDays: 21,
    groupAttendanceWindow: 3,
    groupAttendanceDrop: 0.2,
    familyOverdueInvoices: 2,
    occupancy: 0.6,
  },
  children: [],
  groups: [],
  families: [],
  underfilled: [],
  totals: { children: 0, groups: 0, families: 0, underfilled: 0, all: 0 },
  basis: {
    marksRead: 120,
    childrenWithMarks: 24,
    sessionsWithRegister: 15,
    groupsWithHistory: 2,
    occupancyAsOfToday: true,
  },
  ...overrides,
});

describe("streakSentence", () => {
  it("says how long, since when, and nothing about announcing when nothing was", () => {
    expect(streakSentence(child())).toBe(`3 absențe la rând, din ${formatDateKey("2026-03-09")}`);
  });

  it("counts the announced ones in the feminine", () => {
    expect(streakSentence(child({ announced: 1 }))).toContain(", 1 anunțată");
    expect(streakSentence(child({ announced: 2 }))).toContain(", 2 anunțate");
  });

  it("puts `de` in front of the noun from twenty up", () => {
    expect(streakSentence(child({ streak: 21 }))).toContain("21 de absențe la rând");
  });
});

describe("trendSentence", () => {
  it("names both rates and the window the API used", () => {
    const sentence = trendSentence(
      {
        groupId: 8,
        groupName: "Python",
        locationName: "Drumul Taberei",
        recentRate: 0.33,
        previousRate: 0.92,
        drop: 0.59,
        sessions: 6,
        lastSessionOn: "2026-03-23",
      },
      3
    );

    expect(sentence).toBe(
      `de la ${formatPercent(0.92)} la ${formatPercent(0.33)} pe ultimele 3 ședințe`
    );
  });
});

describe("arrearsSentence", () => {
  it("counts invoices and days, and formats the money the way the rest of the admin does", () => {
    const sentence = arrearsSentence({
      parentId: 21,
      parentName: "Ion Ion",
      email: null,
      phone: null,
      invoices: 2,
      outstanding: 700,
      oldestDaysOverdue: 45,
    });

    expect(sentence).toBe(`2 facturi · ${formatLei(700)} · cea mai veche de 45 de zile`);
  });

  it("uses the singular for one day", () => {
    expect(
      arrearsSentence({
        parentId: 21,
        parentName: "Ion Ion",
        email: null,
        phone: null,
        invoices: 2,
        outstanding: 700,
        oldestDaysOverdue: 1,
      })
    ).toContain("cea mai veche de 1 zi");
  });
});

describe("signalTiles", () => {
  it("gives the four counts, each with the line the API drew", () => {
    const tiles = signalTiles(
      signals({ totals: { children: 2, groups: 1, families: 3, underfilled: 0, all: 6 } })
    );

    expect(tiles.map((tile) => tile.display)).toEqual(["2", "1", "3", "0"]);
    expect(tiles[0]?.note).toBe("ultimele 3 marcaje, toate absențe");
    expect(tiles[1]?.note).toBe(`cu ${formatPercent(0.2)} sau mai mult, pe 3 ședințe`);
    expect(tiles[2]?.note).toBe("2 sau mai multe facturi peste termen");
    expect(tiles[3]?.note).toBe(`sub ${formatPercent(0.6)} ocupare, azi`);
  });
});

describe("basisSentence", () => {
  it("says when, for when, and from how much — and that seats are always today's", () => {
    const sentence = basisSentence(signals());

    expect(sentence).toContain(`pentru ${formatDateKey("2026-03-30")}`);
    expect(sentence).toContain("din 120 de marcaje pe 15 ședințe cu catalog");
    expect(sentence).toContain("2 grupe au destul istoric");
    expect(sentence).toContain("Locurile se numără mereu azi");
    expect(sentence).toContain("Pragurile sunt propuneri, nu decizii.");
  });

  it("counts one group in the singular", () => {
    expect(
      basisSentence(
        signals({
          basis: {
            marksRead: 1,
            childrenWithMarks: 1,
            sessionsWithRegister: 1,
            groupsWithHistory: 1,
            occupancyAsOfToday: true,
          },
        })
      )
    ).toContain("din 1 marcaj pe 1 ședință cu catalog, între");
    expect(
      basisSentence(
        signals({
          basis: {
            marksRead: 1,
            childrenWithMarks: 1,
            sessionsWithRegister: 1,
            groupsWithHistory: 1,
            occupancyAsOfToday: true,
          },
        })
      )
    ).toContain("1 grupă are destul istoric");
  });
});
