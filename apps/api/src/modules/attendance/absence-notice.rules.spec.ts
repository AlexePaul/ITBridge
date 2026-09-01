import { isInTime, schoolLocalStamp, sessionStartStamp } from './absence-notice.rules';

/**
 * The cutoff of E12/S3, which is "before the class starts".
 *
 * These tests are mostly about time zones. The session stores a local date and a local `HH:mm:ss`,
 * `now` is an instant, and comparing the two through UTC is the off-by-one-day trap that
 * `class-session.dates.ts` exists to avoid — a school in Bucharest, two hours ahead in summer, is
 * exactly where it bites.
 */
describe('schoolLocalStamp', () => {
    it('reads an instant on the school clock, not on the server one', () => {
        // 13:30 UTC is 16:30 in Bucharest in September (EEST, +3).
        expect(schoolLocalStamp(new Date('2026-09-07T13:30:00.000Z'))).toBe('2026-09-07T16:30');
    });

    it('a late-evening UTC instant is already the next day at school', () => {
        expect(schoolLocalStamp(new Date('2026-09-07T22:30:00.000Z'))).toBe('2026-09-08T01:30');
    });

    it('follows the winter offset too, without being told', () => {
        // January is EET, +2.
        expect(schoolLocalStamp(new Date('2026-01-15T13:30:00.000Z'))).toBe('2026-01-15T15:30');
    });
});

describe('sessionStartStamp', () => {
    it('builds from the stored local components, never through a UTC round trip', () => {
        expect(sessionStartStamp({ date: new Date(2026, 8, 7), startTime: '16:00:00' })).toBe('2026-09-07T16:00');
    });

    it('accepts the string the driver hands back for a date column', () => {
        expect(sessionStartStamp({ date: '2026-09-07' as unknown as Date, startTime: '16:00:00' })).toBe('2026-09-07T16:00');
    });
});

describe('isInTime', () => {
    const session = { date: new Date(2026, 8, 7), startTime: '16:00:00' };

    it('a notice the morning of the class is in time', () => {
        // 06:00 UTC is 09:00 in Bucharest.
        expect(isInTime(session, new Date('2026-09-07T06:00:00.000Z'))).toBe(true);
    });

    it('a notice half an hour before is still in time — that is the whole rule', () => {
        expect(isInTime(session, new Date('2026-09-07T12:30:00.000Z'))).toBe(true);
    });

    it('a notice after the class began is not', () => {
        // 14:00 UTC is 17:00 at school, an hour into a 16:00 class.
        expect(isInTime(session, new Date('2026-09-07T14:00:00.000Z'))).toBe(false);
    });

    it('the minute the class starts is already too late', () => {
        expect(isInTime(session, new Date('2026-09-07T13:00:00.000Z'))).toBe(false);
    });

    it('days ahead is in time; days after is not', () => {
        expect(isInTime(session, new Date('2026-09-01T08:00:00.000Z'))).toBe(true);
        expect(isInTime(session, new Date('2026-09-10T08:00:00.000Z'))).toBe(false);
    });

    it('an instant that is the previous day in UTC is judged on the school clock', () => {
        // 21:30 UTC on the 6th is 00:30 on the 7th in Bucharest — still before a 16:00 class,
        // and a naive UTC comparison would agree by accident. The one that matters is the
        // mirror case, below.
        expect(isInTime(session, new Date('2026-09-06T21:30:00.000Z'))).toBe(true);
        // 22:00 UTC on the 7th is 01:00 on the 8th at school: the class is over, though a UTC
        // date comparison would still call it "the 7th" and let the notice through.
        expect(isInTime(session, new Date('2026-09-07T22:00:00.000Z'))).toBe(false);
    });
});
