import { formatDateKey } from "~/composables/useAdminFormat";
import { dayKey } from "~/composables/useUtils";
import { CHANNEL_LABELS } from "~/types/consent.types";
import type { ChildConsents, PublicationPurpose, PurposeConsent } from "~/types/consent.types";

/**
 * Reading a child's consents — E07/S2. Pure, so the portal and the family page say the same
 * sentence about the same row, and a test can hold it.
 */

/** One purpose's state for a child. The server always sends every purpose, so this finds one. */
export function consentFor(child: ChildConsents, purpose: PublicationPurpose): PurposeConsent {
  const found = child.purposes.find((entry) => entry.purpose === purpose);
  // Only reachable if the contract and the server disagree about which purposes exist — and then
  // "no consent" is the answer that publishes nothing.
  return found ?? { purpose, currentVersion: "", inForce: null, history: [] };
}

/** The day an instant fell on in the reader's calendar, in words: `"25 sept. 2026"`. */
function onDay(at: string): string {
  return formatDateKey(dayKey(new Date(at)));
}

/**
 * The line under a switch: whether it is on, since when, how, and under which text.
 *
 * A withdrawn consent says so rather than reading as one never given: "we stopped" and "you never
 * said yes" are different facts to the family that remembers saying yes.
 */
export function consentSummary(state: PurposeConsent): string {
  if (state.inForce) {
    return (
      `Acord dat pe ${onDay(state.inForce.grantedAt)}, ${CHANNEL_LABELS[state.inForce.grantedVia]}` +
      ` · versiunea ${state.inForce.textVersion}`
    );
  }
  const last = state.history[0];
  if (last?.revokedAt) {
    const by = last.revokedVia ? `, ${CHANNEL_LABELS[last.revokedVia]}` : "";
    return `Acord retras pe ${onDay(last.revokedAt)}${by}. Nu folosim lucrările.`;
  }
  return "Fără acord. Nu folosim lucrările.";
}

/**
 * What may stand next to a published work, and nothing more: first name, the initial of the family
 * name, and the age — `"Ana P., 9 ani"`. The consent text promises exactly this much (§1), so the
 * office list prints it ready to copy rather than leaving somebody to compose it by hand.
 *
 * The age is counted on the calendar, from `YYYY-MM-DD` strings, never through `Date`: a birthday is
 * a day, and the string comparison cannot land on the wrong side of midnight.
 */
export function creditLine(
  child: { firstName: string; lastName: string; birthDate: string },
  today: string
): string {
  const initial = child.lastName.trim().charAt(0).toUpperCase();
  const [birthYear, birthRest] = [
    Number(child.birthDate.slice(0, 4)),
    child.birthDate.slice(5, 10),
  ];
  const [year, rest] = [Number(today.slice(0, 4)), today.slice(5, 10)];
  const age = year - birthYear - (rest < birthRest ? 1 : 0);
  const years = age === 1 ? "an" : age >= 20 ? "de ani" : "ani";
  return `${child.firstName.trim()}${initial ? ` ${initial}.` : ""}, ${age} ${years}`;
}
