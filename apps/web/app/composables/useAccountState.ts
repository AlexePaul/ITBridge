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
  /**
   * Terms §14: any account in use can be suspended, and a suspended one only lifted — the
   * approval waits until then, so the page offers one thing to do, not two that contradict.
   */
  canSuspend: boolean;
  canReactivate: boolean;
}

export function accountState(account: ProfileAccount | null | undefined): AccountState {
  const none = { canApprove: false, canSuspend: false, canReactivate: false };
  if (!account) return { label: "Fără cont", color: "neutral", ...none };
  if (account.suspendedAt) {
    return { label: "Cont suspendat", color: "error", ...none, canReactivate: true };
  }
  if (account.approvalStatus === "REJECTED") {
    return { label: "Cont respins", color: "error", ...none, canApprove: true, canSuspend: true };
  }
  if (account.approvalStatus === "PENDING") {
    return {
      label: "Cont în așteptarea aprobării",
      color: "warning",
      ...none,
      canApprove: true,
      canSuspend: true,
    };
  }
  return account.emailConfirmed
    ? { label: "Cont activ", color: "success", ...none, canSuspend: true }
    : { label: "Cont aprobat, email neconfirmat", color: "warning", ...none, canSuspend: true };
}
