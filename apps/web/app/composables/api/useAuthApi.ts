import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";
import { useUserStore } from "~/stores/userStore";
import type { ConfirmEmailResponse, LoginResponse } from "~/types/auth.types";
import type { LegalDocumentKey } from "~/types/legal.types";

/**
 * What `POST /auth/register` requires. Mirrors `RegisterDto`.
 *
 * The contact details and the emergency contact are not here: E11/S2 split registration into two
 * required steps, and the second one posts to `PUT /profiles/:id`.
 */
export interface RegistrationPayload {
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  email: string;
  /** The checkbox on the form — the server refuses anything else (E22 S2/S4). */
  acceptedTerms: true;
  /**
   * The second checkbox. Separate because Cod civil art. 1203 makes it separate: the unusual
   * clauses of the terms — §14, §15, §18 — produce no effect on an acceptance that covered the
   * whole document in one tick. Refused as anything but `true`, like the one above.
   */
  acceptedUnusualClauses: true;
}

export const useAuthApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();

  const login = async (username: string, password: string) => {
    const response = await api<LoginResponse>("/auth/login", {
      method: "POST",
      body: { username, password },
    });

    // Store tokens in the Pinia store
    if (response && response.accessToken) {
      tokenStore.setAccessToken(response.accessToken);
      tokenStore.setRefreshToken(response.refreshToken || "");
    }

    // Awaited: `/auth/login` returning is not the same as the session being readable. Unawaited,
    // this left `userStore.user` null for the length of a round trip — and `admin-check` sends a
    // null user back to the login page, while `initializeProfile` gives up early on one, so the
    // parent who still owes step two landed on the dashboard instead of the form.
    //
    // Caught, because the tokens are already stored and the session really exists: `/auth/me`
    // failing is something the portal recovers from on its next load, and reporting it to the
    // caller would say „utilizator sau parolă incorectă" about a password that was right.
    try {
      await useUserStore().fetchUser();
    } catch {
      // Left to the boot plugin, which asks again.
    }

    return response;
  };

  /**
   * Creates the account and the profile in one request.
   *
   * The tokens come back and are stored, so the parent lands in the portal signed in — into an
   * account that is neither confirmed nor approved yet. That is deliberate: the portal is where
   * they are told what happens next, and it is the only place they can ask for the confirmation
   * link again.
   */
  const register = async (payload: RegistrationPayload) => {
    const response = await api<LoginResponse>("/auth/register", {
      method: "POST",
      body: payload,
    });

    if (response && response.accessToken) {
      tokenStore.setAccessToken(response.accessToken);
      tokenStore.setRefreshToken(response.refreshToken || "");
    }

    // Awaited, for the same reason as in `login`: the account exists the moment this returns, and
    // step two is where the parent goes next — but the middleware that sends them there reads a
    // flag `initializeProfile` only sets once `userStore.user` is loaded.
    //
    // Caught, because the tokens are stored and the account is real: a failed `/auth/me` is not a
    // failed registration, and saying so would send the family back to a form they already filled.
    try {
      await useUserStore().fetchUser();
    } catch {
      // Left to the boot plugin, which asks again.
    }

    return response;
  };

  /**
   * Opens the first gate. Unauthenticated on purpose — the link is often opened on a device that
   * has never signed in, so the token in the body is the whole credential.
   */
  const confirmEmail = async (token: string) => {
    return api<ConfirmEmailResponse>("/auth/confirm-email", {
      method: "POST",
      body: { token },
    });
  };

  /** Asks for a fresh link, to the address already on file. Takes no address, by design. */
  const resendConfirmation = async () => {
    return api<{ message: string }>("/auth/resend-confirmation", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenStore.accessToken}` },
    });
  };

  /**
   * Real logout: tells the server to revoke the refresh token, rather than only forgetting it here.
   *
   * Without this call E05/S7 was delivered on the backend and unused — the sessions row stayed
   * live and the token kept working for its full seven days after the user pressed "log out".
   * Deliberately best-effort: the local session must be cleared even if the request fails, and
   * revoking an unknown token is a no-op server-side, so there is nothing to report to the user.
   */
  const logout = async () => {
    const refreshToken = tokenStore.refreshToken;
    if (!refreshToken) return;
    try {
      await api<{ message: string }>("/auth/logout", {
        method: "POST",
        body: { refreshToken },
      });
    } catch (err) {
      console.error("Logout request failed; clearing the local session anyway:", err);
    }
  };

  /**
   * Records that this family accepts the documents named — E22 S4, second half.
   *
   * The user is re-fetched afterwards rather than patched here: what is still outstanding is the
   * server's answer, and a screen that crossed items off its own list would be the second copy of
   * a rule this whole story exists to keep in one place. It is also what releases the middleware,
   * which reads the same field.
   */
  const acceptDocuments = async (documents: LegalDocumentKey[]) => {
    await api("/auth/accept-documents", { method: "POST", body: { documents } });
    await useUserStore().fetchUser();
  };

  return { login, register, confirmEmail, resendConfirmation, logout, acceptDocuments };
};
