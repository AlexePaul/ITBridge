import type { AbsenceNotice, ReplacementOption } from "~/types/attendance.types";
import type { ClassSession } from "~/types/class-session.types";
import type { Child } from "~/types/child.types";
import type { AdminBadgeColor } from "~/types/admin-ui.types";
import { dayLabel, weekLabel } from "~/composables/useRescheduleWindows";
import { todayKey } from "~/composables/useAttendanceCalendar";

/**
 * The office's side of announced absences — E12/S3 and S4 — kept away from the screen.
 *
 * Pure on purpose, like `useRescheduleWindows`: what the screen says about a notice depends on two
 * facts frozen on the row (`inTime`, and whether a replacement class is named), the worklist folds
 * by the week the missed class falls in, and every date is read from `YYYY-MM-DD` components —
 * never through `new Date(iso)`, which parses as UTC midnight and is the day before west of
 * Greenwich (CLAUDE.md). Those are the parts worth a test; the lists themselves are the API's, in
 * the API's order.
 */

/** `HH:mm` from the `HH:mm:ss` the API stores. Harmless on a value already trimmed. */
export const hhmm = (time: string): string => time.slice(0, 5);

export interface ISOWeek {
  from: string;
  to: string;
}

/**
 * Monday and Sunday of the week a `YYYY-MM-DD` falls in, inclusive.
 *
 * Built from the three numbers, in local time, and formatted back through `todayKey` — the same
 * discipline as `weekdayNameOf`. The week is the unit here because it is the window of a move:
 * a missed Wednesday is made up on the Thursday or the Saturday of that same week, or not at all.
 */
export const weekOf = (dateKey: string): ISOWeek => {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return { from: dateKey, to: dateKey };
  const weekday = new Date(year, month - 1, day).getDay(); // Sunday is 0
  const sinceMonday = weekday === 0 ? 6 : weekday - 1;
  return {
    from: todayKey(new Date(year, month - 1, day - sinceMonday)),
    to: todayKey(new Date(year, month - 1, day - sinceMonday + 6)),
  };
};

/** `dateKey` shifted by `days`, through local components. */
export const addDaysToKey = (dateKey: string, days: number): string => {
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;
  return todayKey(new Date(year, month - 1, day + days));
};

export interface NoticesByWeek {
  week: ISOWeek;
  /** "7–13 septembrie 2026" */
  label: string;
  notices: AbsenceNotice[];
}

/**
 * The worklist folded by the week of the missed class, in the order the notices arrived.
 *
 * Keyed on the Monday rather than on adjacency: the API sends the rows by date, so weeks come out
 * contiguous anyway, but a list that assumed so would split one week in two the day somebody
 * sorted the rows differently.
 */
export const groupNoticesByWeek = (notices: AbsenceNotice[]): NoticesByWeek[] => {
  const weeks = new Map<string, NoticesByWeek>();
  for (const notice of notices) {
    const week = weekOf(notice.classSession.date);
    const existing = weeks.get(week.from);
    if (existing) {
      existing.notices.push(notice);
      continue;
    }
    weeks.set(week.from, { week, label: weekLabel(week), notices: [notice] });
  }
  return [...weeks.values()];
};

/** "marți, 8 septembrie, 17:00" — the class as the office names it on the phone. */
export const classLabel = (session: Pick<ClassSession, "date" | "startTime">): string =>
  `${dayLabel(session.date)}, ${hhmm(session.startTime)}`;

/** "marți, 8 septembrie · 17:00–18:30" — one entry of the "which class" list. */
export const sessionChoiceLabel = (
  session: Pick<ClassSession, "date" | "startTime" | "endTime">
): string => `${dayLabel(session.date)} · ${hhmm(session.startTime)}–${hhmm(session.endTime)}`;

/** "Ana Pop · Python" — one entry of the "which child" list; the group is what disambiguates. */
export const childChoiceLabel = (child: Pick<Child, "firstName" | "lastName" | "group">): string =>
  child.group
    ? `${child.firstName} ${child.lastName} · ${child.group.name}`
    : `${child.firstName} ${child.lastName}`;

/**
 * The classes a notice can still be written against: from today on, and not called off.
 *
 * Today's class is kept even once it has started — the family may ring at the hour itself, and
 * the API is the one that knows whether the register is already taken.
 */
export const announceableSessions = <T extends Pick<ClassSession, "date" | "status" | "startTime">>(
  sessions: T[],
  today: string
): T[] =>
  sessions
    .filter((session) => session.date >= today && session.status !== "cancelled")
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

/** "1 loc liber" / "3 locuri libere" */
export const freeSeatsLabel = (free: number): string =>
  free === 1 ? "1 loc liber" : `${free} locuri libere`;

/** "17:00–18:30 · Python · Drumul Taberei" — the location only when the API knows it. */
export const optionLabel = (option: ReplacementOption): string =>
  [`${hhmm(option.startTime)}–${hhmm(option.endTime)}`, option.groupName, option.locationName]
    .filter(Boolean)
    .join(" · ");

export interface OptionsByDay {
  date: string;
  /** "joi, 10 septembrie" */
  label: string;
  options: ReplacementOption[];
}

/** The offered classes folded by day, in the order the API sent them — by day, then hour. */
export const groupOptionsByDay = (options: ReplacementOption[]): OptionsByDay[] => {
  const days = new Map<string, OptionsByDay>();
  for (const option of options) {
    const existing = days.get(option.date);
    if (existing) {
      existing.options.push(option);
      continue;
    }
    days.set(option.date, { date: option.date, label: dayLabel(option.date), options: [option] });
  }
  return [...days.values()];
};

/**
 * What a notice is, read off the two facts frozen on it.
 *
 * `placed` — the office named the class the child goes to instead. `waiting` — announced before
 * Monday noon of the class's week and not placed yet. `late` — announced after it. The last two
 * differ only in what the badge says: a late notice still gets the "mută" button, because `inTime`
 * records when the office typed, not when the family rang, and the office is the one who knows
 * which (E12/S3).
 */
export type NoticeState = "placed" | "waiting" | "late";

export const noticeState = (
  notice: Pick<AbsenceNotice, "inTime" | "replacementSession">
): NoticeState => (notice.replacementSession ? "placed" : notice.inTime ? "waiting" : "late");

export const NOTICE_STATE_LABELS = {
  placed: "Mutat",
  waiting: "În termen",
  late: "După termen",
} as const satisfies Record<NoticeState, string>;

export const NOTICE_STATE_COLORS = {
  placed: "success",
  waiting: "primary",
  late: "warning",
} as const satisfies Record<NoticeState, AdminBadgeColor>;

/**
 * Where the family was told to bring the child — the same facts the email names, in the same
 * order: the group is the name they look for, the day and hour are when, the location is where
 * they drive to. Empty for a notice nobody has placed.
 */
export const moveSentence = (notice: AbsenceNotice): string => {
  const to = notice.replacementSession;
  if (!to) return "";
  const where = [
    to.group ? `grupa ${to.group.name}` : null,
    classLabel(to),
    to.room?.location ? `la ${to.room.location.name}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return `${notice.child.firstName} merge la ${where}.`;
};

/**
 * A notice that is about to fall through: in time, not placed, and the missed class is today or
 * already gone. The week may still have a class that fits — that is why the row stays on the list —
 * but nobody has looked, and the whole reason the count sits in the menu is that somebody can
 * forget to.
 */
export const isSlipping = (
  notice: Pick<AbsenceNotice, "inTime" | "replacementSession" | "classSession">,
  today: string
): boolean => noticeState(notice) === "waiting" && notice.classSession.date <= today;

/** When the week has no other class the child could sit in. */
export const NO_OPTIONS_SENTENCE =
  "Nicio oră potrivită în săptămâna asta: nicio altă grupă pe banda lui de vârstă, cu un loc liber, care să nu fi început. Copilul nu se mută, iar anunțul rămâne consemnat.";
