import type { ISODateTime } from './common';

/** Mirrors `Role` in `apps/api/src/enum/role.enum.ts`. */
export enum Role {
    PARENT = 'PARENT',
    ADMIN = 'ADMIN',
}

/**
 * Mirrors `ApprovalStatus` in `apps/api/src/enum/approval-status.enum.ts` — as a union of literals,
 * deliberately, not as an `enum`.
 *
 * This package describes the **wire format**, and on the wire this is a string. An `enum` would also
 * be a runtime value, and a runtime value from this package is a hazard in the browser: the package
 * is CommonJS, Vite pre-bundles it, and the pre-bundler dropped the enum's initialiser as dead code
 * while keeping the `exports.ApprovalStatus = void 0` line above it. The import then resolved to
 * `undefined` and every comparison against it threw — silently, inside a `computed`, so the notice
 * that depended on it simply never rendered.
 *
 * A union has no runtime half to lose. It also compares cleanly with string literals, which is what
 * the JSON actually contains, and `contract.ts` still checks the backend's enum against it.
 * `Weekday` and `Role` stay enums because they predate this and are used as values elsewhere;
 * nothing new in this package should be one.
 */
export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface User {
    id: number;
    username: string;
    role: Role;
    createdAt: ISODateTime;
}

/**
 * What `GET /auth/me` returns: the user, plus the state of both account gates from E11/S2.
 *
 * `emailConfirmed` and `active` are booleans rather than the timestamps behind them, because no
 * screen needs the instant — only whether the gate is open. `active` is derived on the server from
 * the other two, so the portal cannot compute it differently from the API that enforces it.
 */
export interface CurrentUser extends User {
    emailConfirmed: boolean;
    approvalStatus: ApprovalStatus;
    active: boolean;
    /**
     * Whether step two of registration is done — phone, address and an emergency contact.
     *
     * Derived on the server by `isProfileComplete`, for the same reason `active` is: the portal must
     * not own a second copy of a rule the API enforces, or the screen that redirects and the
     * endpoint that refuses would disagree about the same family. Always `true` for an admin, who
     * has no profile and needs none.
     */
    profileComplete: boolean;
}

/** One row of the admin approvals queue, `GET /users/pending`. */
export interface PendingAccount {
    userId: number;
    username: string;
    createdAt: ISODateTime;
    emailConfirmed: boolean;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
}
