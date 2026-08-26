import type { ISODate, TimeOfDay } from './common';
import type { Group } from './group';

/**
 * Valorile pe care le scrie efectiv `AttendanceService.createAttendance`: `'regular'` pentru un
 * copil din grupa lui, `'make-up'` pentru unul venit în recuperare.
 *
 * Atenție, în cod mai există două valori care **nu** sunt scrise niciodată de serviciu și nu au ce
 * căuta aici: default-ul coloanei din `attendance.entity.ts` este `'normal'`, iar exemplul din
 * `@ApiProperty` al lui `markAttendance.dto.ts` spune `'catch-up'`. Sunt rămășițe inconsecvente —
 * default-ul se poate vedea totuși pe rânduri inserate direct în baza de date, de aceea consumatorii
 * tratează valorile necunoscute cu o alternativă, nu cu o eroare.
 */
export type AttendanceType = 'regular' | 'make-up';

export interface Attendance {
    id: number;
    group: Group;
    date: ISODate;
    startTime: TimeOfDay;
    type: AttendanceType;
    present: boolean;
}
