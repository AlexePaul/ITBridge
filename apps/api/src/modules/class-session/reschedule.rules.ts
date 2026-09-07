import { addDays, parseIsoDate, toIsoDate } from './class-session.dates';

/**
 * Where a class that cannot be held may be put instead — E12/S9.
 *
 * A public holiday on Monday, a building closed for a day, snow: the whole group moves to another
 * hour **in the same week**, into a slot nobody else is using. The move itself is S5's; what this
 * file holds is the part S5 left to the person at the screen — which slots are free — and the one
 * rule S5 does not check, the week.
 *
 * Everything here is pure. The service reads the timetable, the calendar and the rooms, and hands
 * the facts to `buildRescheduleWindows`; the tests hand it the same facts by hand. Time-of-day
 * arithmetic is on `HH:mm` strings throughout, never on `Date`, for the reason `class-session.dates`
 * gives: a `time` column has no day and no zone, and turning it into an instant invents both.
 */

export interface Week {
    /** Monday, ISO. */
    from: string;
    /** Sunday, ISO, inclusive. */
    to: string;
}

/** One slot the class could be moved into, as the office's screen reads it. */
export interface RescheduleWindow {
    date: string;
    /** `HH:mm`. */
    startTime: string;
    /** `HH:mm`. */
    endTime: string;
    roomId: number;
    roomName: string;
    locationName: string;
}

/** A room a window can be offered in. Ordered by the caller: the group's own room first. */
export interface WindowRoom {
    id: number;
    name: string;
    locationName: string;
}

/** A live class occupying a room for part of a day. `HH:mm` or `HH:mm:ss`, both accepted. */
export interface BusySlot {
    date: string;
    roomId: number;
    startTime: string;
    endTime: string;
}

export interface WindowSearch {
    week: Week;
    /** How long the group's class is — the length every window has to have. */
    durationMinutes: number;
    /** Candidate start times, `HH:mm`: the hours this school actually teaches at. */
    starts: string[];
    rooms: WindowRoom[];
    /** Days the school calendar closes at this location. */
    closedDays: Set<string>;
    /** Days the group already has another class on, whatever its state — the unique index says one a day. */
    daysTakenByGroup: Set<string>;
    /** Every live class at the location that week, minus the one being moved. */
    busy: BusySlot[];
    /** The slot the class holds now, so it is not offered back as a "window". `null` when it was never generated. */
    current: { date: string; startTime: string; roomId: number } | null;
    /** The school's wall clock, `YYYY-MM-DDTHH:mm` — a slot that has begun is not a window. */
    now: string;
}

export function isInWeek(week: Week, date: string): boolean {
    return date >= week.from && date <= week.to;
}

/** Every day of the week, Monday first. */
export function daysOf(week: Week): string[] {
    const days: string[] = [];
    let cursor = parseIsoDate(week.from);
    const last = parseIsoDate(week.to);
    while (cursor.getTime() <= last.getTime()) {
        days.push(toIsoDate(cursor));
        cursor = addDays(cursor, 1);
    }
    return days;
}

/** `HH:mm` from whatever a `time` column or a DTO carries. */
export function hhmm(time: string): string {
    return time.slice(0, 5);
}

export function minutesOf(time: string): number {
    const [hours, minutes] = hhmm(time).split(':').map(Number);
    return hours * 60 + minutes;
}

export function minutesBetween(startTime: string, endTime: string): number {
    return minutesOf(endTime) - minutesOf(startTime);
}

/**
 * `startTime` plus `minutes`, or `null` when that reaches midnight — nothing is taught then, and
 * `24:00` is not an hour the write would accept.
 */
export function addMinutes(startTime: string, minutes: number): string | null {
    const total = minutesOf(startTime) + minutes;
    if (total >= 24 * 60) return null;
    const hours = Math.floor(total / 60);
    const rest = total % 60;
    return `${`${hours}`.padStart(2, '0')}:${`${rest}`.padStart(2, '0')}`;
}

/**
 * True when the two intervals share any minute. Half-open on both: a class ending at 17:30 and one
 * starting at 17:30 are back to back, not in each other's way — the same rule the room-clash query
 * in `moveSession` applies with `<`.
 */
export function overlaps(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
    return hhmm(bStart) < hhmm(aEnd) && hhmm(aStart) < hhmm(bEnd);
}

/**
 * The free slots, in the order the office reads them: by day, then by hour, then the group's own
 * room before any other.
 *
 * A window is a `(day, start, room)` triple where: the day is inside the week and the calendar does
 * not close it; the group has no other class that day (the unique index would refuse the row, and
 * the timetable would be wrong before it did); the slot has not yet begun on the school's clock;
 * the class fits before midnight; no live class overlaps it in that room; and it is not the slot
 * the class already holds. "Free" is about the **room** only — the platform has no teachers, so
 * it cannot know that the same person is due in the other room at that hour. E09 is cut from the
 * MVP, and this is one of the places that shows.
 */
export function buildRescheduleWindows(search: WindowSearch): RescheduleWindow[] {
    const starts = [...new Set(search.starts.map(hhmm))].sort();
    const windows: RescheduleWindow[] = [];

    for (const date of daysOf(search.week)) {
        if (search.closedDays.has(date)) continue;
        if (search.daysTakenByGroup.has(date)) continue;

        for (const startTime of starts) {
            if (`${date}T${startTime}` <= search.now) continue;
            const endTime = addMinutes(startTime, search.durationMinutes);
            if (endTime === null) continue;

            for (const room of search.rooms) {
                const isCurrent =
                    search.current !== null &&
                    search.current.date === date &&
                    hhmm(search.current.startTime) === startTime &&
                    search.current.roomId === room.id;
                if (isCurrent) continue;

                const taken = search.busy.some(
                    (slot) => slot.date === date && slot.roomId === room.id && overlaps(startTime, endTime, slot.startTime, slot.endTime),
                );
                if (taken) continue;

                windows.push({ date, startTime, endTime, roomId: room.id, roomName: room.name, locationName: room.locationName });
            }
        }
    }

    return windows;
}
