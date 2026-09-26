/**
 * A number and its noun, the way Romanian says them: "1 familie", "2 familii", "20 de familii".
 *
 * The same rule as the web's `countOf` (`apps/web/app/composables/useRomanianCount.ts`): from twenty
 * up, whenever the last two digits are 00 or 20–99, the number takes "de" — "101 zile" but
 * "120 de zile". The office's Monday digest wrote "cea mai veche de 45 zile" (QA of 26 September
 * 2026).
 */
export function countOf(n: number, one: string, many: string): string {
    if (n === 1) return `1 ${one}`;
    const lastTwo = n % 100;
    const withDe = n >= 20 && (lastTwo === 0 || lastTwo >= 20);
    return `${n} ${withDe ? 'de ' : ''}${many}`;
}
