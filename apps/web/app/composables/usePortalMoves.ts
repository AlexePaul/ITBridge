import { formatDateKey } from "~/composables/useAdminFormat";
import { formatTime, weekdayNameOf } from "~/composables/useUtils";
import type { AbsenceNotice } from "~/types/attendance.types";
import type { ClassSession } from "~/types/class-session.types";

/**
 * How the portal words a move — the office sending a child to another group's class in place of the
 * one the family said they would miss (E12 S4).
 *
 * The QA of 27 September 2026 found the sentences saying three wrong things, none of which shows on
 * a screenshot of one family:
 *
 *  - „Mutat în săptămâna asta" about a class nine days away. A move lands in the week of the missed
 *    class, which is not always this one, so the sentences name the missed class instead — true at
 *    any distance.
 *  - „L-am mutat" is masculine, and the platform does not know a child's gender. The move is a noun
 *    here, or the child's name is the subject.
 *  - „Marți 6 oct." — a weekday with a capital in the middle of a sentence.
 */

/** „marți" — a weekday inside a sentence, lower case as Romanian writes it. */
export const weekdayInSentence = (dateKey: string): string =>
  weekdayNameOf(dateKey).toLocaleLowerCase("ro-RO");

/** „la grupa Scratch Avansați", or „la altă grupă" when the class came without its group. */
const toGroup = (session: Pick<ClassSession, "group"> | null): string =>
  session?.group?.name ? `la grupa ${session.group.name}` : "la altă grupă";

/** The missed class, as the move's reason: „în locul orei din 29 sept. 2026". */
const inPlaceOf = (notice: Pick<AbsenceNotice, "classSession">): string =>
  `în locul orei din ${formatDateKey(notice.classSession.date)}`;

/** Under the next class on Acasă, when that class is a move: its day and hour are printed above. */
export const movedClassNote = (
  notice: Pick<AbsenceNotice, "classSession" | "replacementSession">
): string => `Mutare ${toGroup(notice.replacementSession)}, ${inPlaceOf(notice)}.`;

/** The to-do on Acasă: where and when, since nobody remembers a room from an email. */
export const moveTodoText = (
  notice: Pick<AbsenceNotice, "classSession" | "replacementSession">
): string => {
  const to = notice.replacementSession;
  if (!to) return "";
  return (
    `Mutare ${toGroup(to)}: ${weekdayInSentence(to.date)}, ${formatDateKey(to.date)}, ` +
    `ora ${formatTime(to.startTime)}, ${inPlaceOf(notice)}.`
  );
};

/**
 * What follows the group's name on a move's card in Absențe și recuperări — the place, then the
 * missed class. It starts with the comma: the template had the comma on a line of its own, and Vue
 * condenses the line break before it into a space („Scratch Avansați , Sala 2").
 */
export const moveCardTail = (notice: Pick<AbsenceNotice, "classSession">, place: string): string =>
  `${place ? `, ${place}` : ""}, ${inPlaceOf(notice)}.`;
