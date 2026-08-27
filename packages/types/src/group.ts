import type { TimeOfDay } from './common';
import type { Weekday } from './weekday';

export interface Group {
    id: number;
    weekday: Weekday;
    startTime: TimeOfDay;
    endTime: TimeOfDay;
    minAge: number;
    maxAge: number;
    isActive: boolean;
}
