import { countOf } from './romanian-count';

describe('countOf', () => {
    it('names one thing in the singular', () => {
        expect(countOf(1, 'zi', 'zile')).toBe('1 zi');
    });

    it('adds "de" from twenty up, when the last two digits are 00 or 20–99', () => {
        expect(countOf(2, 'zi', 'zile')).toBe('2 zile');
        expect(countOf(19, 'zi', 'zile')).toBe('19 zile');
        expect(countOf(20, 'zi', 'zile')).toBe('20 de zile');
        expect(countOf(45, 'zi', 'zile')).toBe('45 de zile');
        expect(countOf(101, 'zi', 'zile')).toBe('101 zile');
        expect(countOf(120, 'zi', 'zile')).toBe('120 de zile');
        expect(countOf(200, 'zi', 'zile')).toBe('200 de zile');
    });

    it('says zero in the plural', () => {
        expect(countOf(0, 'factură', 'facturi')).toBe('0 facturi');
    });
});
