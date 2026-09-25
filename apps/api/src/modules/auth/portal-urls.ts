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

/**
 * The link mailed to a parent who cannot get in. Same shape as the confirmation link, and for the
 * same reason: the page reads the token out of the query string, so nothing has to be typed.
 */
export function passwordResetUrl(token: string): string {
    return `${siteBase()}/auth/reset-password?token=${encodeURIComponent(token)}`;
}

export function loginUrl(): string {
    return `${siteBase()}/auth/login`;
}

/** The public pages the legal documents are rendered on — the same files as `docs/legal/`. */
export function termsUrl(): string {
    return `${siteBase()}/termeni`;
}

export function privacyUrl(): string {
    return `${siteBase()}/confidentialitate`;
}

/**
 * The text a family agrees to when it lets a child's work appear in the school's materials — E07 S2.
 * Rendered from `docs/legal/acord-lucrari.md`, like the three documents above.
 */
export function consentTextUrl(): string {
    return `${siteBase()}/acord-lucrari`;
}

/** The family's own profile page, where the acceptance record can be read again (terms §4.7). */
export function profileUrl(): string {
    return `${siteBase()}/user/profile`;
}

/** Where a parent goes to announce an absence or book a make-up. E12/S3 and S4. */
export function absencesUrl(): string {
    return `${siteBase()}/user/absente`;
}

/**
 * Where a family finds its invoices and payments — the fiscal invoice's link and, for cash, the
 * receipt SmartBill numbered. E16/S6: the confirmation of a payment points here.
 */
export function paymentsUrl(): string {
    return `${siteBase()}/user/payments`;
}

/** One family's page on the admin side — where the office records or withdraws a consent (E07 S2). */
export function adminFamilyUrl(profileId: number): string {
    return `${siteBase()}/admin/profiles/${profileId}`;
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

/**
 * The „nu mai vreau" link at the foot of every marketing e-mail — E17 S4.
 *
 * A public page rather than a bare endpoint, because the link is a `GET` in an e-mail and mail
 * clients, scanners and link-preview bots fetch those without anybody clicking. A `GET` that
 * unsubscribed on sight would quietly opt families out of a newsletter they never refused, and the
 * evidence would look exactly like people refusing. The page asks first; the write is a `POST`.
 */
export function unsubscribeUrl(token: string): string {
    return `${siteBase()}/dezabonare?token=${encodeURIComponent(token)}`;
}

/** The parent's own gallery: everything their children have made, in one place. */
export function projectGalleryUrl(): string {
    return `${siteBase()}/user/proiecte`;
}

/** The group screen an admin reviews uploads on, for the internal "something needs looking at" mail. */
export function adminGroupProjectsUrl(groupId: number): string {
    return `${siteBase()}/admin/proiecte/grupa/${groupId}`;
}
