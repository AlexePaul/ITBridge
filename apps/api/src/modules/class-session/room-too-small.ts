import { countOf } from 'src/common/romanian-count';

/**
 * The refusal when a class would move into a room its children do not fit in — `ROOM_TOO_SMALL`.
 *
 * One sentence for the two places that refuse it (moving a class, recovering one), counted in
 * Romanian: "are 1 locuri, iar la ora asta vin 1 copii" was what the office read for a small room
 * (QA of 27 September 2026).
 */
export function roomTooSmallMessage(roomName: string, capacity: number, expected: number): string {
    const coming = expected === 1 ? 'vine un copil' : `vin ${countOf(expected, 'copil', 'copii')}`;
    return `Sala „${roomName}" are ${countOf(capacity, 'loc', 'locuri')}, iar la ora asta ${coming}.`;
}
