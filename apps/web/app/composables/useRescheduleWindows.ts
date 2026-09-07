import type { RescheduleWindow, RescheduleWindows } from "~/types/class-session.types";

/**
 * The Romanian wording of the "recuperează ora" dialog — E12/S9 — kept away from the screen.
 *
 * Pure on purpose, like `useClassSessionSchedule`: the sentence above the list depends on which of
 * three states the class is in and on whether the calendar closed the day, and that is the part
 * worth a test. The list itself is the API's, in the API's order; this only folds it by day.
 */

export interface WindowsByDay {
  date: string;
  /** "marți, 6 aprilie" */
  label: string;
  windows: RescheduleWindow[];
}

/**
 * `2027-04-06` as `marți, 6 aprilie`. The weekday is the point: the office is choosing another
 * day, and "6 aprilie" alone makes them count on their fingers.
 *
 * Built from local components rather than `new Date(iso)`, for the reason `formatIsoDay` gives:
 * a bare date parses as UTC midnight and formats as the day before west of Greenwich.
 */
export const dayLabel = (iso: string): string => {
  const parts = iso.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return iso;
  }
  const [year = 0, month = 1, day = 1] = parts;
  return new Date(year, month - 1, day).toLocaleDateString("ro-RO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
};

/** `6–12 aprilie 2027`, or both ends in full when the week straddles a month. */
export const weekLabel = (week: { from: string; to: string }): string => {
  const [fromYear, fromMonth, fromDay] = week.from.split("-").map(Number);
  const [toYear, toMonth, toDay] = week.to.split("-").map(Number);
  if (!fromYear || !fromMonth || !fromDay || !toYear || !toMonth || !toDay) {
    return `${week.from} – ${week.to}`;
  }
  const to = new Date(toYear, toMonth - 1, toDay).toLocaleDateString("ro-RO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  if (fromYear === toYear && fromMonth === toMonth) {
    return `${fromDay}–${to}`;
  }
  const from = new Date(fromYear, fromMonth - 1, fromDay).toLocaleDateString("ro-RO", {
    day: "numeric",
    month: "long",
  });
  return `${from} – ${to}`;
};

/** The list folded by day, in the order the API sent it — by day, then hour, then the own room first. */
export const groupWindowsByDay = (windows: RescheduleWindow[]): WindowsByDay[] => {
  const days: WindowsByDay[] = [];
  for (const window of windows) {
    const last = days[days.length - 1];
    if (last && last.date === window.date) {
      last.windows.push(window);
      continue;
    }
    days.push({ date: window.date, label: dayLabel(window.date), windows: [window] });
  }
  return days;
};

/** `17:00–18:30 · Sala 1` */
export const windowLabel = (window: RescheduleWindow): string =>
  `${window.startTime}–${window.endTime} · ${window.roomName}`;

/** What a screen selects by: the triple that makes a window a window. */
export const windowKey = (
  window: Pick<RescheduleWindow, "date" | "startTime" | "roomId">
): string => `${window.date}T${window.startTime}@${window.roomId}`;

/**
 * The sentence above the list — what the class is on the missed day, in the office's words.
 *
 * `blocked` wins, and its message is the API's: it names the day the week's class already sits on,
 * or says the class was taught, and both are answers rather than errors.
 */
export const rescheduleStateSentence = (result: RescheduleWindows): string => {
  if (result.blocked) {
    return result.blocked.message;
  }
  const day = dayLabel(result.missedDate);
  if (result.source === null) {
    return result.missedDayClosed
      ? `Ora de ${day} nu a fost generată — ziua e în calendarul școlar.`
      : `Ora de ${day} nu e în orar — nu a fost generată încă.`;
  }
  if (result.source.status === "cancelled") {
    return result.missedDayClosed
      ? `Ora de ${day} e anulată — ziua e în calendarul școlar.`
      : `Ora de ${day} e anulată.`;
  }
  return `Ora de ${day}, ${result.source.startTime}, e programată — se mută în fereastra aleasă.`;
};

/** When nothing blocks the recovery and the week still has nothing free. */
export const NO_WINDOWS_SENTENCE =
  "Nicio fereastră liberă în săptămâna asta. Ora nu se ține, iar luna se facturează cu o ședință mai puțin.";
