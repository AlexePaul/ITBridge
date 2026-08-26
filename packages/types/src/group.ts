import type { TimeOfDay } from './common';

export interface Group {
    id: number;
    /** Zi ISO: 1 = luni, 7 = duminică. */
    weekday: number;
    startTime: TimeOfDay;
    endTime: TimeOfDay;
    minAge: number;
    maxAge: number;
    isActive: boolean;
}
