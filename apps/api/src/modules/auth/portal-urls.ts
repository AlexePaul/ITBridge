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

/**
 * Where a mailed document sends the parent. E14/S5.
 *
 * **The link is an announcement, not a delivery.** It carries a random identifier rather than the
 * child's name, and the page behind it asks for a login: the backend checks the child is theirs and
 * only then signs a URL that the browser downloads with. A link that works without an account works
 * for whoever it is forwarded to, and what opens is a named child's work.
 *
 * No storage URL ever goes into an email, a message or a log.
 */
export function projectUrl(publicId: string): string {
    return `${siteBase()}/files/${encodeURIComponent(publicId)}`;
}

/** The parent's own gallery: everything their children have made, in one place. */
export function projectGalleryUrl(): string {
    return `${siteBase()}/user/proiecte`;
}

/** The group screen an admin reviews uploads on, for the internal "something needs looking at" mail. */
export function adminGroupProjectsUrl(groupId: number): string {
    return `${siteBase()}/admin/proiecte/grupa/${groupId}`;
}
