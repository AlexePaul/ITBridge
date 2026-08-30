import { useApi } from "./useApi";
import { useTokenStore } from "~/stores/tokenStore";
import { useUserStore } from "~/stores/userStore";
import type { ConfirmEmailResponse, LoginResponse } from "~/types/auth.types";

/** Everything `POST /auth/register` requires since E11/S2. Mirrors `RegisterDto`. */
export interface RegistrationPayload {
  username: string;
  password: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  emergencyContactName: string;
  emergencyContactRelation: string;
  emergencyContactPhone: string;
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

    useUserStore().fetchUser();

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

    useUserStore().fetchUser();

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

  return { login, register, confirmEmail, resendConfirmation, logout };
};
