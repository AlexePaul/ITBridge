/**
 * Where to go after signing in, when the login form interrupted somebody on their way elsewhere.
 *
 * The address arrives in the query string, so it is anybody's to write: a link to our login page
 * with `?inapoi=https://…` would otherwise send a parent who has just typed their password to a
 * page of the linker's choosing. Only a path on this site is accepted — one leading slash, not two
 * (`//host` is a URL to another host), and no backslash, which browsers read as a slash.
 */
export function safeReturnPath(raw: unknown): string | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== "string") return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  if (value.includes("\\")) return null;
  // Back to the login form itself would be a loop with extra steps.
  if (value.startsWith("/auth/")) return null;
  return value;
}
