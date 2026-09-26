import type { ProfileAccount } from "~/types/profile.types";

/**
 * What the family page says about the account behind a family, and whether it offers „Aprobă" —
 * review of 26 September 2026.
 *
 * A refused account used to vanish from every screen the moment somebody pressed „Respinge", while
 * the refusal mail and the portal told the family „scrie-ne… ne uităm încă o dată". Approving it
 * again was always possible on the API; nothing offered it. A pending account gets the same button
 * the approvals queue has, so the office does not have to leave the family to decide.
 */
export interface AccountState {
  label: string;
  color: "success" | "warning" | "error" | "neutral";
  canApprove: boolean;
}

export function accountState(account: ProfileAccount | null | undefined): AccountState {
  if (!account) return { label: "Fără cont", color: "neutral", canApprove: false };
  if (account.approvalStatus === "REJECTED") {
    return { label: "Cont respins", color: "error", canApprove: true };
  }
  if (account.approvalStatus === "PENDING") {
    return { label: "Cont în așteptarea aprobării", color: "warning", canApprove: true };
  }
  return account.emailConfirmed
    ? { label: "Cont activ", color: "success", canApprove: false }
    : { label: "Cont aprobat, email neconfirmat", color: "warning", canApprove: false };
}
