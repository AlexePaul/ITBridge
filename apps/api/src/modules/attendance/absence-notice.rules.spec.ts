import { canBackfill, isInTime, noticeDeadlineFor, schoolLocalStamp, sessionStartStamp } from './absence-notice.rules';

/**
 * The cutoff of E12/S3, which is **Monday noon, for the whole week**.
 *
 * These tests are mostly about two things. One is time zones: the session stores a local date and a
 * local `HH:mm:ss`, `now` is an instant, and comparing the two through UTC is the off-by-one-day
 * trap that `class-session.dates.ts` exists to avoid — a school in Bucharest, two hours ahead in
 * summer, is exactly where it bites. The other is the week boundary, which is the new half: the
 * deadline belongs to the class's week, not to the class.
 *
 * 7 September 2026 is a Monday. Every date below is anchored to that week.
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

describe('noticeDeadlineFor', () => {
    it('is Monday noon of the week the class falls in', () => {
        // Wednesday the 9th belongs to the week that opens on Monday the 7th.
        expect(noticeDeadlineFor({ date: new Date(2026, 8, 9) })).toBe('2026-09-07T12:00');
    });

    it('is the same instant for every class of that week', () => {
        const monday = noticeDeadlineFor({ date: new Date(2026, 8, 7) });
        const saturday = noticeDeadlineFor({ date: new Date(2026, 8, 12) });
        expect(saturday).toBe(monday);
    });

    it('counts Sunday into the week that opened six days earlier, not the one starting tomorrow', () => {
        // ISO weeks end on Sunday. Getting this wrong would give a Sunday class a deadline six days
        // after it had already happened.
        expect(noticeDeadlineFor({ date: new Date(2026, 8, 13) })).toBe('2026-09-07T12:00');
    });

    it('crosses a month boundary with the week, not with the calendar', () => {
        // Thursday 1 October 2026 is in the week that opened on Monday 28 September.
        expect(noticeDeadlineFor({ date: new Date(2026, 9, 1) })).toBe('2026-09-28T12:00');
    });

    it('accepts the string the driver hands back for a date column', () => {
        expect(noticeDeadlineFor({ date: '2026-09-09' as unknown as Date })).toBe('2026-09-07T12:00');
    });
});

describe('isInTime', () => {
    // A Wednesday class, 16:00.
    const session = { date: new Date(2026, 8, 9), startTime: '16:00:00' };

    it('the weekend before is in time', () => {
        expect(isInTime(session, new Date('2026-09-06T09:00:00.000Z'))).toBe(true);
    });

    it('Monday morning is in time', () => {
        // 06:00 UTC is 09:00 in Bucharest.
        expect(isInTime(session, new Date('2026-09-07T06:00:00.000Z'))).toBe(true);
    });

    it('the minute the deadline falls is already too late', () => {
        // 09:00 UTC is 12:00 at school, exactly noon on the Monday.
        expect(isInTime(session, new Date('2026-09-07T09:00:00.000Z'))).toBe(false);
    });

    it('Monday afternoon is too late, though the class is two days away', () => {
        // This is the whole difference from the rule this replaced, which asked only about the
        // class: at 15:00 on Monday the Wednesday class has not started, and the notice still fails.
        expect(isInTime(session, new Date('2026-09-07T12:00:00.000Z'))).toBe(false);
    });

    it('the morning of the class is far too late', () => {
        expect(isInTime(session, new Date('2026-09-09T06:00:00.000Z'))).toBe(false);
    });

    it('the week before is in time; the week after is not', () => {
        expect(isInTime(session, new Date('2026-09-01T08:00:00.000Z'))).toBe(true);
        expect(isInTime(session, new Date('2026-09-16T08:00:00.000Z'))).toBe(false);
    });

    it('judges the deadline on the school clock, not on UTC', () => {
        // 09:30 UTC on the Monday is 12:30 at school — past noon, so out of time. A naive UTC
        // comparison against "12:00" would call it in time by three hours.
        expect(isInTime(session, new Date('2026-09-07T09:30:00.000Z'))).toBe(false);
        // 08:30 UTC is 11:30 at school: the last half hour, and in time.
        expect(isInTime(session, new Date('2026-09-07T08:30:00.000Z'))).toBe(true);
    });

    it('an instant that is Sunday in UTC can already be Monday at school', () => {
        // 22:00 UTC on Sunday the 6th is 01:00 on Monday the 7th in Bucharest — still before noon,
        // so in time either way. The mirror case is what the school clock is for.
        expect(isInTime(session, new Date('2026-09-06T22:00:00.000Z'))).toBe(true);
    });
});

describe('canBackfill', () => {
    // The replacement class the child was moved into: Thursday, 17:00.
    const replacement = { date: new Date(2026, 8, 10), startTime: '17:00:00' };

    it('is open while the replacement class has not started', () => {
        // Thursday 13:00 UTC is 16:00 at school, an hour before.
        expect(canBackfill(replacement, new Date('2026-09-10T13:00:00.000Z'))).toBe(true);
    });

    it('is open days earlier, when the office notices its own omission', () => {
        expect(canBackfill(replacement, new Date('2026-09-08T08:00:00.000Z'))).toBe(true);
    });

    it('closes the minute that class begins', () => {
        // 14:00 UTC is 17:00 at school.
        expect(canBackfill(replacement, new Date('2026-09-10T14:00:00.000Z'))).toBe(false);
    });

    it('is shut once the class is over — the move can no longer have happened', () => {
        expect(canBackfill(replacement, new Date('2026-09-11T08:00:00.000Z'))).toBe(false);
    });

    it('is bounded by the class, not by the deadline it forgives', () => {
        // Past Monday noon, which is the point: this exists precisely for notices that missed it.
        expect(isInTime({ date: new Date(2026, 8, 9) }, new Date('2026-09-09T06:00:00.000Z'))).toBe(false);
        expect(canBackfill(replacement, new Date('2026-09-09T06:00:00.000Z'))).toBe(true);
    });
});
