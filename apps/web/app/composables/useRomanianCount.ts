/**
 * A number and its noun, the way Romanian says them: "1 familie", "2 familii", "20 de familii".
 *
 * Romanian puts "de" between a number and its noun from twenty up, whenever the last two digits are
 * 00 or 20–99 — "101 familii" but "120 de familii" — and never below twenty. Screens wrote "de"
 * always ("2 de familii", "coada nu s-a mișcat de 15 de minute") or never ("1 cereri"), which is
 * the grammar mistake a parent notices first (QA of 26 September 2026).
 */
export const countOf = (n: number, one: string, many: string): string => {
  if (n === 1) return `1 ${one}`;
  const lastTwo = n % 100;
  const withDe = n >= 20 && (lastTwo === 0 || lastTwo >= 20);
  return `${n} ${withDe ? "de " : ""}${many}`;
};
