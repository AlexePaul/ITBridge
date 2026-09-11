import { useApi } from "./useApi";

/**
 * The way out of marketing messages — E17/S4.
 *
 * Public, like the trial booking: the parent reading a newsletter is not signed in, and a login
 * would make refusing harder than consenting was. `useApi` attaches an `Authorization` header when
 * there happens to be a token, which the server ignores here — the token in the body is the whole
 * credential.
 */
export const useMarketingApi = () => {
  const api = useApi();

  /**
   * Records the refusal. Always resolves the same way whether or not the token named anybody: the
   * server does not say, on purpose, so that the endpoint cannot be used to hunt for valid ones.
   */
  const unsubscribe = (token: string) =>
    api<{ message: string }>("/marketing/unsubscribe", { method: "POST", body: { token } });

  return { unsubscribe };
};
