import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";
import { useUserStore } from "~/stores/userStore";
import type {
  ActiveSession,
  ConfirmEmailResponse,
  LoginResponse,
  RegisterResponse,
} from "~/types/auth.types";
import type { LegalDocumentKey, LegalRecord } from "~/types/legal.types";
import { useProfileInitialization } from "~/composables/useProfileInitialization";

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

/**
 * What `POST /auth/claim` requires. Mirrors `ClaimAccountDto`: the link's token and what an account
 * needs, minus the name and the address, which the office already holds for this family.
 */
export interface ClaimAccountPayload {
  token: string;
  username: string;
  password: string;
  acceptedTerms: true;
  acceptedUnusualClauses: true;
}

export const useAuthApi = () => {
  const api = useApi();
  const tokenStore = useTokenStore();

  /**
   * `remember` is „Ține-mă minte": ticked, the refresh token is kept seven days; unticked, it goes
   * when the browser closes. The server issues the same token either way — the choice is only how
   * long this browser holds it.
   */
  const login = async (username: string, password: string, remember = false) => {
    const response = await api<LoginResponse>("/auth/login", {
      method: "POST",
      body: { username, password },
    });

    // Store tokens in the Pinia store
    if (response && response.accessToken) {
      tokenStore.setAccessToken(response.accessToken);
      tokenStore.setRefreshToken(response.refreshToken || "", remember);
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
    // And the profile-setup gate, for the same reason: `02.profile-setup.global` reads the flag
    // this sets, and the navigation that follows a login is the first thing it guards. It swallows
    // its own failures, so awaiting it cannot make the login fail.
    await useProfileInitialization().initializeProfile();

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
  const register = async (
    payload: RegistrationPayload,
    remember = false
  ): Promise<RegisterResponse> => {
    const response = await api<RegisterResponse>("/auth/register", {
      method: "POST",
      body: payload,
    });

    // A family the office already typed in: no account was created and there are no tokens — a
    // link went to the address, and the account is made from it (E11 S2). Nothing to sign in to.
    if ("claimSent" in response) {
      return response;
    }

    await startSession(response, remember);
    return response;
  };

  /**
   * Creates the account of a family the office typed in, from the link mailed to its address, and
   * signs the family in — what `register` does after its request, for the same reasons. Public, like
   * the reset link: the token is the whole credential.
   */
  const claimAccount = async (payload: ClaimAccountPayload): Promise<LoginResponse> => {
    const response = await api<LoginResponse>("/auth/claim", {
      method: "POST",
      body: payload,
    });
    await startSession(response);
    return response;
  };

  /** Stores a fresh account's tokens and reads the gates, as registration always has. */
  const startSession = async (response: LoginResponse, remember = false) => {
    if (response && response.accessToken) {
      tokenStore.setAccessToken(response.accessToken);
      tokenStore.setRefreshToken(response.refreshToken || "", remember);
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
    // Here rather than on the page, where it was missing (end-to-end testing, 25 September 2026):
    // `login.vue` called it and `register.vue` did not, so the flag was still `false` from boot and
    // every family that had just registered — none of whom has a phone, an address or an emergency
    // contact yet — went past the step that "cannot be skipped" until their next full reload.
    await useProfileInitialization().initializeProfile();
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
   * Asks for a reset link. Public, and unauthenticated by necessity: the whole premise is that the
   * parent cannot sign in.
   *
   * **The answer is the same whether or not the address has an account**, so the caller has nothing
   * to branch on and the screen must not invent a branch: a page that said „adresa nu există" would
   * turn the form into a way of asking whether a given family is at this school.
   */
  const forgotPassword = async (email: string) => {
    return api<{ message: string }>("/auth/forgot-password", {
      method: "POST",
      body: { email },
    });
  };

  /**
   * Spends the link and sets the new password. Public for the same reason `confirmEmail` is: the
   * token is the whole credential, and a gate demanding the account it opens would be a circle.
   *
   * Every session is revoked server-side, this browser's included, so there is nothing to keep —
   * the page sends the parent to the login form with the password they have just chosen.
   */
  const resetPassword = async (token: string, password: string) => {
    return api<{ message: string }>("/auth/reset-password", {
      method: "POST",
      body: { token, password },
    });
  };

  /**
   * Changes the password from inside the account. The current one is required, and not as ceremony:
   * an access token is honoured for fifteen minutes without the server consulting `sessions`, so a
   * tab left open on a shared machine reaches this route.
   *
   * The server ends every session, this one included, so the caller signs out afterwards rather
   * than carrying tokens that have stopped meaning anything.
   */
  const changePassword = async (currentPassword: string, newPassword: string) => {
    return api<{ message: string }>("/auth/change-password", {
      method: "POST",
      body: { currentPassword, newPassword },
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

  /**
   * The family's own acceptance record — terms §4.7: every version accepted, with its day, and the
   * versions in force beside them. Read from the ledger each time, never kept: it is short, and a
   * copy in a store would be the second place that says what this family agreed to.
   */
  const fetchLegalRecord = () => api<LegalRecord>("/auth/documents");

  /**
   * The family's open sessions, this one marked — terms §4.5. The refresh token goes in the body so
   * the server can say which session is this browser's; it never goes in a URL.
   */
  const fetchSessions = () =>
    api<ActiveSession[]>("/auth/sessions", {
      method: "POST",
      body: { refreshToken: tokenStore.refreshToken ?? undefined },
    });

  /**
   * „Deconectează-te de pe toate dispozitivele" — terms §4.4. Every session of the account ends on
   * the server, this one included; the caller signs out locally afterwards.
   */
  const logoutEverywhere = () => api<{ message: string }>("/auth/logout-all", { method: "POST" });

  return {
    login,
    register,
    claimAccount,
    fetchSessions,
    logoutEverywhere,
    confirmEmail,
    resendConfirmation,
    forgotPassword,
    resetPassword,
    changePassword,
    logout,
    acceptDocuments,
    fetchLegalRecord,
  };
};
