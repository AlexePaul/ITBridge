import type { ISODateTime } from './common';

/** Mirrors `Role` in `apps/api/src/enum/role.enum.ts`. */
export type Role = 'ADMIN' | 'PARENT';

export interface User {
    id: number;
    username: string;
    role: Role;
    createdAt: ISODateTime;
}
