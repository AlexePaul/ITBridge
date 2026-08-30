import type { ApprovalStatus } from './user';

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
