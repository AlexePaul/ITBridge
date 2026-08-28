import type { TimeOfDay } from './common';
import type { Room } from './room';
import type { Weekday } from './weekday';

export interface Group {
    id: number;
    /** What an admin calls it: "Scratch Începători". */
    name: string;
    weekday: Weekday;
    startTime: TimeOfDay;
    endTime: TimeOfDay;
    /**
     * Always present: the room is where the group's location comes from, so every endpoint that
     * returns a group loads it. Uniqueness is on room + weekday + start time, not on the slot
     * alone — two locations can and do teach at the same hour.
     */
    room: Room;
    /** Maximum enrolment. Enforcement and waiting lists arrive with E11. */
    capacity: number;
    minAge: number;
    maxAge: number;
    isActive: boolean;
}
