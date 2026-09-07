import { addMinutes, buildRescheduleWindows, daysOf, isInWeek, minutesBetween, overlaps, WindowSearch } from './reschedule.rules';

/**
 * The free-window arithmetic of E12/S9, on facts handed in by hand.
 *
 * 2027-04-05 is a Monday. Every search below is that week, for a class of ninety minutes at a
 * location that teaches at 16:00 and 18:00 in two rooms; each test changes one fact and reads
 * what disappears from the list.
 */
const WEEK = { from: '2027-04-05', to: '2027-04-11' };

const search = (overrides: Partial<WindowSearch> = {}): WindowSearch => ({
    week: WEEK,
    durationMinutes: 90,
    starts: ['16:00', '18:00'],
    rooms: [
        { id: 1, name: 'Sala 1', locationName: 'Drumul Taberei' },
        { id: 2, name: 'Sala 2', locationName: 'Drumul Taberei' },
    ],
    closedDays: new Set(['2027-04-05']),
    daysTakenByGroup: new Set(),
    busy: [],
    current: { date: '2027-04-05', startTime: '16:00', roomId: 1 },
    // Sunday before the week: nothing has begun.
    now: '2027-04-04T12:00',
    ...overrides,
});

describe('reschedule rules', () => {
    describe('the week', () => {
        it('holds both boundaries and nothing past them', () => {
            expect(isInWeek(WEEK, '2027-04-05')).toBe(true);
            expect(isInWeek(WEEK, '2027-04-11')).toBe(true);
            expect(isInWeek(WEEK, '2027-04-04')).toBe(false);
            expect(isInWeek(WEEK, '2027-04-12')).toBe(false);
        });

        it('lists Monday through Sunday, seven days', () => {
            expect(daysOf(WEEK)).toEqual(['2027-04-05', '2027-04-06', '2027-04-07', '2027-04-08', '2027-04-09', '2027-04-10', '2027-04-11']);
        });

        // The clocks go forward on 2027-03-28; the week that straddles it is still seven days.
        it('is seven days across the clock change too', () => {
            expect(daysOf({ from: '2027-03-22', to: '2027-03-28' })).toHaveLength(7);
        });
    });

    describe('time of day', () => {
        it('adds minutes to HH:mm', () => {
            expect(addMinutes('17:00', 90)).toBe('18:30');
            expect(addMinutes('09:05', 55)).toBe('10:00');
        });

        it('refuses to reach midnight — 24:00 is not an hour the write accepts', () => {
            expect(addMinutes('23:00', 90)).toBeNull();
            expect(addMinutes('22:30', 90)).toBeNull();
            expect(addMinutes('22:00', 90)).toBe('23:30');
        });

        it('measures a class from its stored HH:mm:ss', () => {
            expect(minutesBetween('16:00:00', '17:30:00')).toBe(90);
        });

        it('treats back-to-back classes as not overlapping, with or without seconds', () => {
            expect(overlaps('16:00', '17:30', '17:30:00', '19:00:00')).toBe(false);
            expect(overlaps('17:30', '19:00', '16:00:00', '17:30:00')).toBe(false);
            expect(overlaps('16:00', '17:30', '17:00:00', '18:30:00')).toBe(true);
            expect(overlaps('17:00', '18:30', '16:00', '17:30')).toBe(true);
        });
    });

    describe('windows', () => {
        it('offers every open day, every teaching hour, every room — by day, hour, own room first', () => {
            const windows = buildRescheduleWindows(search());

            // Six open days × two hours × two rooms.
            expect(windows).toHaveLength(24);
            expect(windows.slice(0, 4)).toEqual([
                { date: '2027-04-06', startTime: '16:00', endTime: '17:30', roomId: 1, roomName: 'Sala 1', locationName: 'Drumul Taberei' },
                { date: '2027-04-06', startTime: '16:00', endTime: '17:30', roomId: 2, roomName: 'Sala 2', locationName: 'Drumul Taberei' },
                { date: '2027-04-06', startTime: '18:00', endTime: '19:30', roomId: 1, roomName: 'Sala 1', locationName: 'Drumul Taberei' },
                { date: '2027-04-06', startTime: '18:00', endTime: '19:30', roomId: 2, roomName: 'Sala 2', locationName: 'Drumul Taberei' },
            ]);
        });

        it('skips the days the calendar closes', () => {
            const windows = buildRescheduleWindows(search({ closedDays: new Set(['2027-04-05', '2027-04-06', '2027-04-07']) }));

            expect(windows.map((window) => window.date)).not.toContain('2027-04-06');
            expect(windows.map((window) => window.date)).not.toContain('2027-04-07');
            expect(windows[0].date).toBe('2027-04-08');
        });

        it('skips a day the group already has a class on, whatever its state', () => {
            const windows = buildRescheduleWindows(search({ daysTakenByGroup: new Set(['2027-04-08']) }));

            expect(windows.map((window) => window.date)).not.toContain('2027-04-08');
        });

        it('leaves out a room busy at that hour, and offers the other one', () => {
            const windows = buildRescheduleWindows(search({ busy: [{ date: '2027-04-06', roomId: 1, startTime: '17:00:00', endTime: '18:30:00' }] }));

            const tuesdayAtFour = windows.filter((window) => window.date === '2027-04-06' && window.startTime === '16:00');
            expect(tuesdayAtFour.map((window) => window.roomId)).toEqual([2]);
            // 18:00 in room 1 touches the busy class at 18:30 — overlapping, not adjacent.
            const tuesdayAtSix = windows.filter((window) => window.date === '2027-04-06' && window.startTime === '18:00');
            expect(tuesdayAtSix.map((window) => window.roomId)).toEqual([2]);
        });

        it('does not count a class that ends exactly when the window starts', () => {
            const windows = buildRescheduleWindows(search({ busy: [{ date: '2027-04-06', roomId: 1, startTime: '16:30:00', endTime: '18:00:00' }] }));

            const tuesdayAtSix = windows.filter((window) => window.date === '2027-04-06' && window.startTime === '18:00');
            expect(tuesdayAtSix.map((window) => window.roomId)).toEqual([1, 2]);
        });

        it('leaves out the slots that have already begun on the school clock', () => {
            const windows = buildRescheduleWindows(search({ now: '2027-04-06T16:00' }));

            expect(windows.some((window) => window.date === '2027-04-06' && window.startTime === '16:00')).toBe(false);
            expect(windows.some((window) => window.date === '2027-04-06' && window.startTime === '18:00')).toBe(true);
            expect(windows.some((window) => window.date === '2027-04-07' && window.startTime === '16:00')).toBe(true);
        });

        it('does not offer the class its own slot back', () => {
            const windows = buildRescheduleWindows(search({ closedDays: new Set() }));

            const monday = windows.filter((window) => window.date === '2027-04-05');
            expect(monday.some((window) => window.startTime === '16:00' && window.roomId === 1)).toBe(false);
            // The other room at the same hour, and the later hour in its own room, are both moves.
            expect(monday.some((window) => window.startTime === '16:00' && window.roomId === 2)).toBe(true);
            expect(monday.some((window) => window.startTime === '18:00' && window.roomId === 1)).toBe(true);
        });

        it('offers everything when the class was never generated', () => {
            const windows = buildRescheduleWindows(search({ current: null, closedDays: new Set() }));

            expect(windows.some((window) => window.date === '2027-04-05' && window.startTime === '16:00' && window.roomId === 1)).toBe(true);
        });

        it('drops an hour the class would not fit into before midnight', () => {
            const windows = buildRescheduleWindows(search({ starts: ['16:00', '23:00'] }));

            expect(windows.some((window) => window.startTime === '23:00')).toBe(false);
        });

        it('takes the teaching hours as HH:mm:ss too, once each, in order', () => {
            const windows = buildRescheduleWindows(search({ starts: ['18:00:00', '16:00', '16:00:00'] }));

            expect([...new Set(windows.map((window) => window.startTime))]).toEqual(['16:00', '18:00']);
        });

        it('is empty when every day is closed', () => {
            expect(buildRescheduleWindows(search({ closedDays: new Set(daysOf(WEEK)) }))).toEqual([]);
        });
    });
});
