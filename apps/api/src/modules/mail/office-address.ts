/**
 * Where the school's own mail goes, and where it goes when nobody said.
 *
 * `MAIL_OFFICE_ADDRESS` is optional, so the fallback is the address the public site publishes, from
 * `apps/web/shared/school.ts` — copied rather than imported, because `apps/api` does not depend on
 * `apps/web`, and this is the fallback rather than the source of truth.
 *
 * It lives in the mail module because more than one thing sends to the office now: E12's
 * unmarked-attendance reminder, and E11's "a family is waiting for approval". The constant used to
 * sit on the reminder job, which meant the second caller would have had to import from
 * `class-session` to send an email — a dependency that says nothing true about either module.
 */
export const DEFAULT_OFFICE_ADDRESS = 'office@itbridgeschool.com';

/** Read at construction time by each caller: changing it means a restart either way. */
export function officeAddress(): string {
    return process.env.MAIL_OFFICE_ADDRESS?.trim() || DEFAULT_OFFICE_ADDRESS;
}
