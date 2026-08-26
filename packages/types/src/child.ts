import type { ISODate } from './common';
import type { Group } from './group';
import type { ProfileSummary } from './profile';

export interface Child {
    id: number;
    parent: ProfileSummary;
    firstName: string;
    lastName: string;
    birthDate: ISODate;
    createdAt: ISODate;
    /** Lipsește cât timp copilul nu e repartizat: relația e `nullable`, cu `onDelete: 'SET NULL'`. */
    group?: Group | null;
}
