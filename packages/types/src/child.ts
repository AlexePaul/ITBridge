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
    /** Absent while the child is unassigned: the relation is nullable, with `onDelete: 'SET NULL'`. */
    group?: Group | null;
}
