// stores/tokenStore.ts
import { defineStore } from "pinia";

/**
 * A login lasts seven days, because that is exactly how long the token it rests on is good for.
 *
 * `useCookie(name)` with no options writes a **session** cookie: Nuxt's `CookieDefaults` set
 * `path`, `watch`, `decode`, `encode` and `refresh`, and nothing else — no `maxAge`, no `expires`.
 * So both tokens were thrown away the moment the browser closed. Everything on the other side of
 * the wire was built for the opposite: `jwtConstants.refreshTokenExpiration` is seven days, the
 * `sessions` table tracks each token, and rotation revokes the whole family when a consumed one
 * comes back. All of that exists so a family signs in once — and the client discarded it every
 * evening, so a parent retyped their password on every visit. Nobody decided that; it was the
 * default nobody revisited.
 *
 * Seven days mirrors `JWT_REFRESH_TOKEN_EXPIRATION` (`apps/api/src/constants/jwtConstants.ts`) and
 * the two numbers have to move together. They cannot be derived from one another: the browser
 * cannot read the API's environment, and `useCookie` fixes `maxAge` when the ref is created, so it
 * cannot be read off each token either. Longer than the token would leave the cookie outliving what
 * it holds, which a parent reads as a session that ends at random; shorter throws away days the
 * server is still honouring.
 */
const REFRESH_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

/**
 * `secure` is decided from the connection in front of us, never from the build.
 *
 * `import.meta.dev` is the obvious test and it is the wrong one, in two places that matter.
 * `pnpm test:a11y:auth` serves a **production** build over `http://127.0.0.1:3124` and waits for
 * the `accessToken` cookie to appear; a build-mode `secure` would have the browser drop the cookie
 * without a word, and the job would fail thirty seconds later looking exactly like a wrong
 * password. And the authenticated area is meant to be checked on a phone at 390px (E18 S7), which
 * in practice means plain HTTP against a LAN address. The protocol of the page actually asking is
 * the only test that is right in all three places at once.
 *
 * `sameSite: "lax"` is storage hygiene rather than CSRF defence: the tokens travel in the
 * `Authorization` header, and the API reads no cookies at all.
 */
const cookieOptions = (maxAge?: number) => ({
  sameSite: "lax" as const,
  secure: useRequestURL().protocol === "https:",
  ...(maxAge === undefined ? {} : { maxAge }),
});

export const useTokenStore = defineStore("tokens", () => {
  /**
   * The access token stays session-scoped, and that is the decision rather than an oversight.
   *
   * It is a fifteen-minute grant that `AuthGuard` accepts without consulting the `sessions` table,
   * so there is no reason to write it to disk for longer than the tab is open. What carries a
   * returning parent back in is the refresh token below, and `useApi` mints a new access token from
   * it on the first 401.
   */
  const accessToken = useCookie("accessToken", cookieOptions());
  const refreshToken = useCookie("refreshToken", cookieOptions(REFRESH_TOKEN_MAX_AGE_SECONDS));

  const setAccessToken = (token: string) => {
    accessToken.value = token;
  };

  const setRefreshToken = (token: string) => {
    refreshToken.value = token;
  };

  const clearTokens = () => {
    accessToken.value = null;
    refreshToken.value = null;
  };

  return {
    accessToken: readonly(accessToken),
    refreshToken: readonly(refreshToken),
    setAccessToken,
    setRefreshToken,
    clearTokens,
  };
});
