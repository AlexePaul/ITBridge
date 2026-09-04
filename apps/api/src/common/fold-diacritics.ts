/**
 * Diacritics off, case off — the one definition of "the same word to a reader".
 *
 * The combining marks Romanian uses — breve, circumflex, comma below — all decompose into
 * U+0300–U+036F, so one range covers ă, â, î, ș and ț.
 *
 * It lives here rather than in either of its callers because both are asking the *same* question
 * about the *same* thing: E17/S7 checks whether an announcement names a child, E20/S2 decides
 * whether two bookings are for one child. Two copies could drift, and the day they did, "Ștefan"
 * would be one child to one screen and two to the other.
 */
export function foldDiacritics(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}
