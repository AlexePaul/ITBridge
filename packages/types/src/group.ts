import type { TimeOfDay } from './common';

export interface Group {
    id: number;
    /** ISO weekday: 1 = Monday, 7 = Sunday. */
    weekday: number;
    startTime: TimeOfDay;
    endTime: TimeOfDay;
    minAge: number;
    maxAge: number;
    isActive: boolean;
}
