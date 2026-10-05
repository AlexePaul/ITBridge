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
    /**
     * The first day of the child's place in `group` — the enrolment in force — or `null` without
     * one. Sent by `GET /children`, so a calendar can tell a class the child missed from one the
     * group held before they arrived.
     */
    groupSince?: ISODate | null;
}
