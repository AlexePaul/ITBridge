import type { ISODateTime } from './common';
import type { ApprovalStatus } from './user';

/**
 * One open session of the caller — `GET` and `POST /auth/sessions` (terms §4.5). `createdAt` is when
 * the refresh token in it was issued, which a rotation renews; `current` marks the session of the
 * refresh token the caller sent, and is always `false` on the `GET`.
 */
export interface ActiveSession {
    id: number;
    createdAt: ISODateTime;
    expiresAt: ISODateTime;
    userAgent: string | null;
    current: boolean;
}

export interface LoginResponse {
    accessToken: string;
    refreshToken: string;
}

/** What `POST /auth/confirm-email` answers with — E11/S2, first gate. */
export interface ConfirmEmailResponse {
    message: string;
    emailConfirmed: boolean;
    approvalStatus: ApprovalStatus;
    /** Both gates open. False here means the account is confirmed but still awaiting an admin. */
    active: boolean;
}

/**
 * What `POST /auth/register` answers when the address belongs to a family the office typed in and
 * which has no account yet — E11 S2, review of 26 September 2026. No account and no tokens: a link
 * went to that address, and the account is created from it, on the office's row.
 */
export interface AccountClaimSent {
    claimSent: true;
    message: string;
}

/** What `POST /auth/register` answers: an account signed in, or a link sent to finish one. */
export type RegisterResponse = LoginResponse | AccountClaimSent;
