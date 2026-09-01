import { bucketFor, daysOverdue, daysUntilDue, dueDateFor, PAYMENT_TERM_DAYS } from './arrears.rules';
import { toIsoDate } from 'src/modules/class-session/class-session.dates';

describe('dueDateFor', () => {
    it('gives fourteen days from the day the invoice was issued', () => {
        expect(toIsoDate(dueDateFor('2026-03-01'))).toBe('2026-03-15');
        expect(PAYMENT_TERM_DAYS).toBe(14);
    });

    it('crosses a month boundary without arithmetic of its own', () => {
        expect(toIsoDate(dueDateFor('2026-02-25'))).toBe('2026-03-11');
    });

    it('lands on a real day across the autumn clock change', () => {
        // A naive `+ 14 * 86400000` would answer 23:00 the day before here, and the calendar day
        // would then read one short — a family told the 30th, chased on the 30th.
        expect(toIsoDate(dueDateFor('2026-10-16'))).toBe('2026-10-30');
    });
});

describe('daysOverdue', () => {
    it('is zero on the day the term runs out — the last day is still theirs', () => {
        expect(daysOverdue('2026-03-01', new Date(2026, 2, 15))).toBe(0);
    });

    it('is one the day after', () => {
        expect(daysOverdue('2026-03-01', new Date(2026, 2, 16))).toBe(1);
    });

    it('is zero well before the term, never negative', () => {
        expect(daysOverdue('2026-03-01', new Date(2026, 2, 2))).toBe(0);
    });

    it('counts whole days across the clock change, not hours', () => {
        // 30 Oct due, 2 Nov today: three days, and the extra hour of the change must not make it
        // two-and-a-bit rounded down.
        expect(daysOverdue('2026-10-16', new Date(2026, 10, 2))).toBe(3);
    });
});

describe('daysUntilDue', () => {
    it('counts down to the term and past it', () => {
        expect(daysUntilDue('2026-03-01', new Date(2026, 2, 12))).toBe(3);
        expect(daysUntilDue('2026-03-01', new Date(2026, 2, 15))).toBe(0);
        expect(daysUntilDue('2026-03-01', new Date(2026, 2, 18))).toBe(-3);
    });
});

describe('bucketFor', () => {
    it('separates the bands an admin would act on differently', () => {
        // A week late is a reminder; two months late is a conversation.
        expect(bucketFor(0, 3)).toBe('due_soon');
        expect(bucketFor(7, -7)).toBe('overdue');
        expect(bucketFor(31, -31)).toBe('over_30');
        expect(bucketFor(61, -61)).toBe('over_60');
    });

    it('puts the boundaries where the words say they are', () => {
        expect(bucketFor(30, -30)).toBe('overdue');
        expect(bucketFor(60, -60)).toBe('over_30');
    });
});
