import { formatDateKey, formatLei, formatPercent } from "~/composables/useAdminFormat";
import type {
  ChildAbsenceSignal,
  EarlySignals,
  FamilyArrearsSignal,
  GroupAttendanceSignal,
} from "~/types/reports.types";

/**
 * The Romanian wording of the "Semnale" tab — E21/S7 — kept away from the screen.
 *
 * Pure, like the other report helpers: every sentence names a threshold the API sent, so the
 * screen can never draw a line the server did not, and the counting of Romanian nouns is the part
 * most likely to come out wrong.
 */

export interface SignalTile {
  label: string;
  display: string;
  note: string;
}

/** Romanian counts the noun, and from twenty up puts `de` in front of it. */
const count = (value: number, singular: string, plural: string): string => {
  if (value === 1) return `1 ${singular}`;
  return value >= 20 && (value % 100 === 0 || value % 100 >= 20)
    ? `${value} de ${plural}`
    : `${value} ${plural}`;
};

/** `3 absențe la rând, din 9 mar 2026, 1 anunțată` */
export const streakSentence = (signal: ChildAbsenceSignal): string => {
  const announced =
    signal.announced > 0 ? `, ${count(signal.announced, "anunțată", "anunțate")}` : "";
  return `${count(signal.streak, "absență", "absențe")} la rând, din ${formatDateKey(signal.since)}${announced}`;
};

/** `de la 92% la 33% pe ultimele 3 ședințe` */
export const trendSentence = (signal: GroupAttendanceSignal, window: number): string =>
  `de la ${formatPercent(signal.previousRate)} la ${formatPercent(signal.recentRate)} pe ultimele ${count(window, "ședință", "ședințe")}`;

/** `2 facturi · 700 lei · cea mai veche de 45 de zile` */
export const arrearsSentence = (signal: FamilyArrearsSignal): string =>
  `${count(signal.invoices, "factură", "facturi")} · ${formatLei(signal.outstanding)} · cea mai veche de ${count(signal.oldestDaysOverdue, "zi", "zile")}`;

/** The four counts, each with the line it was drawn at. */
export const signalTiles = (signals: EarlySignals): SignalTile[] => [
  {
    label: "Copii care nu mai vin",
    display: String(signals.totals.children),
    note: `ultimele ${signals.thresholds.childAbsenceStreak} marcaje, toate absențe`,
  },
  {
    label: "Grupe cu prezența în scădere",
    display: String(signals.totals.groups),
    note: `cu ${formatPercent(signals.thresholds.groupAttendanceDrop)} sau mai mult, pe ${signals.thresholds.groupAttendanceWindow} ședințe`,
  },
  {
    label: "Familii cu restanțe repetate",
    display: String(signals.totals.families),
    note: `${signals.thresholds.familyOverdueInvoices} sau mai multe facturi peste termen`,
  },
  {
    label: "Grupe sub prag",
    display: String(signals.totals.underfilled),
    note: `sub ${formatPercent(signals.thresholds.occupancy)} ocupare, azi`,
  },
];

/** The footnote: when, for when, and from how much. The report's own honesty about its data. */
export const basisSentence = (signals: EarlySignals): string => {
  const marks = count(signals.basis.marksRead, "marcaj", "marcaje");
  const sessions = count(
    signals.basis.sessionsWithRegister,
    "ședință cu catalog",
    "ședințe cu catalog"
  );
  const groups = count(signals.basis.groupsWithHistory, "grupă are", "grupe au");
  return (
    `Calculat la ${formatDateKey(signals.generatedOn)}, pentru ${formatDateKey(signals.asOf)}, din ${marks} pe ${sessions}, ` +
    `între ${formatDateKey(signals.lookbackFrom)} și ${formatDateKey(signals.asOf)}. ${groups} destul istoric ca să li se citească tendința. ` +
    `Locurile se numără mereu azi, oricare ar fi ziua aleasă. Pragurile sunt propuneri, nu decizii.`
  );
};
