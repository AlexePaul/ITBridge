import type { GenerateClassSessionsResult } from "~/types/class-session.types";

/**
 * The Romanian wording for a generation run, kept away from the two screens that trigger one.
 *
 * Pure on purpose: this is the half of the feature worth a test, and both callers need the exact
 * same sentence. A run for one group and a run for the whole school differ only in whether the
 * group count is worth saying out loud.
 */

/**
 * Romanian counts the noun, and then decides whether the number needs "de".
 *
 * One takes the article ("o ședință"), 2 to 19 take the bare plural ("3 ședințe"), and from 20 up
 * the plural is introduced by "de" ("20 de ședințe") - except when the last two digits fall back
 * into 1..19, which is why 101 is "101 ședințe" and 120 is "120 de ședințe". Both nouns this file
 * counts, `ședință` and `grupă`, are feminine, hence "o" rather than "un".
 */
export const countLabel = (count: number, singular: string, plural: string): string => {
  if (count === 1) {
    return `o ${singular}`;
  }

  const lastTwo = count % 100;
  const needsDe = count >= 20 && (lastTwo === 0 || lastTwo >= 20);

  return needsDe ? `${count} de ${plural}` : `${count} ${plural}`;
};

/**
 * `2026-09-25` as `25 septembrie 2026`.
 *
 * Split by hand rather than handed to `new Date(iso)`: that parses a bare date as UTC midnight, so
 * every timezone west of Greenwich formats it as the day before. The same trap the server avoids in
 * `class-session.dates.ts`, and the reason the attendance screen builds its own ISO strings.
 */
export const formatIsoDay = (iso: string): string => {
  const parts = iso.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) {
    return iso;
  }

  const [year = 0, month = 1, day = 1] = parts;
  return new Date(year, month - 1, day).toLocaleDateString("ro-RO", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
};

/**
 * What the admin is told after generating: how many classes now exist, until when, and how many
 * were already there.
 *
 * The last number is the one that makes a second press safe to try. Generation is idempotent, so
 * pressing again answers "nothing new, everything was already there" instead of doubling a
 * timetable - and saying so is the difference between a button people use and one they avoid.
 */
export const generatedScheduleMessage = (result: GenerateClassSessionsResult): string => {
  // A school with no active group at all. Reachable from the groups page, which offers the button
  // even when the list below it is empty, and the generic branch would answer "pentru 0 grupe".
  // Only the school-wide run can land here: a targeted one is answered with 404 or GROUP_INACTIVE.
  if (result.groups === 0) {
    return "Nicio grupă activă, deci nu era nimic de generat.";
  }

  // Only worth saying when the run covered more than the one group the admin was looking at.
  const forGroups =
    result.groups === 1 ? "" : ` pentru ${countLabel(result.groups, "grupă", "grupe")}`;
  const until = formatIsoDay(result.to);

  if (result.created === 0) {
    return result.existing === 0
      ? `Nu era nimic de generat${forGroups} până pe ${until}.`
      : `Orarul era deja complet${forGroups}, până pe ${until}. Nu s-a adăugat nimic.`;
  }

  const created = `Am generat ${countLabel(result.created, "ședință", "ședințe")}${forGroups}, până pe ${until}.`;
  if (result.existing === 0) {
    return created;
  }

  // Its own sentence, so the count has to start it: "o ședință exista deja" reads as a typo when
  // it follows a full stop in lower case.
  const existing = countLabel(result.existing, "ședință", "ședințe");
  const existed = result.existing === 1 ? "exista" : "existau";
  return `${created} ${existing.charAt(0).toUpperCase()}${existing.slice(1)} ${existed} deja.`;
};
