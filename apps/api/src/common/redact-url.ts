/** Query keys whose values never appear in a log or an error body. See E07. */
const SENSITIVE_QUERY_KEYS = ['password', 'token', 'refreshToken', 'secret', 'email', 'phone'];

/**
 * Replaces the values of sensitive query keys, keeping the shape of the URL readable.
 *
 * Used by both the request logger and the error filter. They diverged once — the logger redacted
 * and the error body echoed the raw URL back to the caller, which is the wider audience of the two,
 * since a response body reaches the browser console and any frontend error reporter.
 */
export function redactUrl(url: string): string {
    const [path, query] = url.split('?');
    if (!query) return path;

    const redacted = query
        .split('&')
        .map((pair) => {
            const [key] = pair.split('=');
            return SENSITIVE_QUERY_KEYS.includes(key) ? `${key}=[redacted]` : pair;
        })
        .join('&');

    return `${path}?${redacted}`;
}
