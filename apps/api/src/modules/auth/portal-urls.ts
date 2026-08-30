/**
 * Where the portal lives, from the backend's point of view.
 *
 * `SITE_URL` is the frontend's own variable — canonical tags, `og:url`, sitemap entries — and it is
 * reused here rather than adding a second one, because a second could disagree with the first and
 * the failure would be a confirmation link pointing at a domain the school no longer uses.
 *
 * The fallback matches `nuxt.config.ts`: the real domain. A link built with a localhost base and
 * sent to a parent is a dead link, so if the variable is missing the safer wrong answer is
 * production, not this machine.
 */
export const DEFAULT_SITE_URL = 'https://itbridgeschool.com';

function siteBase(): string {
    return (process.env.SITE_URL?.trim() || DEFAULT_SITE_URL).replace(/\/+$/, '');
}

/** The link mailed to a parent. The token travels in the query string, which is where the page reads it. */
export function emailConfirmationUrl(token: string): string {
    return `${siteBase()}/auth/confirm-email?token=${encodeURIComponent(token)}`;
}

export function loginUrl(): string {
    return `${siteBase()}/auth/login`;
}

/** The admin screen the internal "somebody is waiting" mail points at. */
export function approvalsUrl(): string {
    return `${siteBase()}/admin/approvals`;
}
