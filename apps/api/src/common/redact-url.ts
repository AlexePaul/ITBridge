/**
 * Query keys whose values never appear in a log or an error body. See E07.
 *
 * Names belong here as much as contact details do: `/profiles?firstName=Ana` and
 * `/children?lastName=Popescu` are ordinary search requests, and the request logger's own reason
 * for never logging bodies is that they "carry names, emails and passwords". Two of the three were
 * covered.
 *
 * Matched case-insensitively, and after URL-decoding the key, so `?Email=` and `?e%6Dail=` do not
 * slip past a list written in one particular spelling.
 */
const SENSITIVE_QUERY_KEYS = ['password', 'token', 'refreshtoken', 'accesstoken', 'secret', 'email', 'phone', 'firstname', 'lastname', 'address', 'username'];

function isSensitive(rawKey: string): boolean {
    let key = rawKey;
    try {
        key = decodeURIComponent(rawKey);
    } catch {
        // A malformed escape is not a reason to stop redacting; fall back to the raw key.
    }
    return SENSITIVE_QUERY_KEYS.includes(key.toLowerCase());
}

/**
 * Replaces the values of sensitive query keys, keeping the shape of the URL readable.
 *
 * Used by both the request logger and the error filter. They diverged once — the logger redacted
 * and the error body echoed the raw URL back to the caller, which is the wider audience of the two,
 * since a response body reaches the browser console and any frontend error reporter.
 */
export function redactUrl(url: string): string {
    // Split once: a second `?` is legal inside a query string, and `const [path, query] = split('?')`
    // silently dropped everything after it — so the recorded path stopped matching the request that
    // was actually made, which is the one property a correlation id needs.
    const separator = url.indexOf('?');
    if (separator === -1) return url;

    const path = url.slice(0, separator);
    const query = url.slice(separator + 1);
    if (!query) return path;

    const redacted = query
        .split('&')
        .map((pair) => {
            const [key] = pair.split('=');
            return isSensitive(key) ? `${key}=[redacted]` : pair;
        })
        .join('&');

    return `${path}?${redacted}`;
}
