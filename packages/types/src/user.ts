import type { ISODateTime } from './common';

/** Mirrors `Role` in `apps/api/src/enum/role.enum.ts`. */
export enum Role {
    PARENT = 'PARENT',
    ADMIN = 'ADMIN',
}

export interface User {
    id: number;
    username: string;
    role: Role;
    createdAt: ISODateTime;
}
