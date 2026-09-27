import { roomTooSmallMessage } from './room-too-small';

describe('roomTooSmallMessage', () => {
    // QA of 27 September 2026: "Sala „Sala mică" are 1 locuri, iar la ora asta vin 3 copii."
    it('counts one seat and one child in the singular', () => {
        expect(roomTooSmallMessage('Sala mică', 1, 3)).toBe('Sala „Sala mică" are 1 loc, iar la ora asta vin 3 copii.');
        expect(roomTooSmallMessage('Sala mică', 0, 1)).toBe('Sala „Sala mică" are 0 locuri, iar la ora asta vine un copil.');
    });

    it('puts "de" before twenty and more, like every other count on screen', () => {
        expect(roomTooSmallMessage('Aula', 20, 24)).toBe('Sala „Aula" are 20 de locuri, iar la ora asta vin 24 de copii.');
    });
});
