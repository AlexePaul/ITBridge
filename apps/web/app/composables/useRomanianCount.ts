/**
 * A number and its noun, the way Romanian says them: "1 familie", "2 familii", "20 de familii".
 *
 * Romanian puts "de" between a number and its noun from twenty up, whenever the last two digits are
 * 00 or 20–99 — "101 familii" but "120 de familii" — and never below twenty. Screens wrote "de"
 * always ("2 de familii", "coada nu s-a mișcat de 15 de minute") or never ("1 cereri"), which is
 * the grammar mistake a parent notices first (QA of 26 September 2026).
 */
export const countOf = (n: number, one: string, many: string): string =>
  `${n} ${nounFor(n, one, many)}`;

/**
 * The noun half of `countOf`, for a number the screen shows on its own — in an input, or styled
 * apart: "[20] de ședințe", "3 din 20 de locuri".
 */
export const nounFor = (n: number, one: string, many: string): string => {
  if (n === 1) return one;
  const lastTwo = n % 100;
  const withDe = n >= 20 && (lastTwo === 0 || lastTwo >= 20);
  return `${withDe ? "de " : ""}${many}`;
};

/**
 * How long something has waited, in calendar days, the way anybody says it: „azi", „ieri", then
 * „2 zile", „20 de zile". The erasure queue printed „0 zile" beside a request made today (QA of
 * 27 September 2026). The approvals queue reads it too, with „acum" before a count.
 */
export const daysWaitedLabel = (days: number): string => {
  if (days <= 0) return "azi";
  if (days === 1) return "ieri";
  return countOf(days, "zi", "zile");
};

/**
 * When something last happened, in calendar days: „azi", „ieri", „acum 5 zile". The leads screen
 * printed „de 0 zile" for a trial held that afternoon, and „de 3 z." in its side panels (QA of 27
 * September 2026); the approvals queue already said it this way.
 */
export const daysAgoLabel = (days: number): string =>
  days > 1 ? `acum ${daysWaitedLabel(days)}` : daysWaitedLabel(days);
