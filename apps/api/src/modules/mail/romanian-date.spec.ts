import { romanianDate, romanianDateRange, romanianDayAndDate } from './romanian-date';

describe('romanian dates', () => {
    it('names a day as a parent reads it', () => {
        expect(romanianDate('2026-03-12')).toBe('12 martie');
        expect(romanianDayAndDate('2026-09-09')).toBe('miercuri, 9 septembrie');
    });

    it('gives a range its year once, and both years when it crosses into the next', () => {
        expect(romanianDateRange('2027-04-01', '2027-04-10')).toBe('1 aprilie – 10 aprilie 2027');
        expect(romanianDateRange('2026-12-21', '2027-01-07')).toBe('21 decembrie 2026 – 7 ianuarie 2027');
    });
});
