import type { ISODate, TimeOfDay } from './common';
import type { Group } from './group';

/**
 * Valorile sunt cele pe care le scrie backend-ul: `'normal'` e default-ul coloanei, `'catch-up'`
 * apare în exemplul din `markAttendance.dto.ts`. Frontend-ul declara `'regular' | 'make-up'`,
 * valori pe care backend-ul nu le-a trimis niciodată — exact divergența tăcută pe care pachetul
 * ăsta o previne.
 */
export type AttendanceType = 'normal' | 'catch-up';

export interface Attendance {
    id: number;
    group: Group;
    date: ISODate;
    startTime: TimeOfDay;
    type: AttendanceType;
    present: boolean;
}
