/**
 * What `main.ts` decides from the environment before it listens — pure, so the production answers
 * can be asserted without booting anything.
 */

/** The public site. Always allowed: it is where the portal is served from in production. */
const SITE_ORIGIN = 'https://itbridgeschool.com';
/** The local frontend, `pnpm dev`'s. Never a production default: nothing there is the school's. */
const LOCAL_ORIGIN = 'http://localhost:3001';

/**
 * Allowed origins, from `CORS_ORIGINS` — a comma-separated list, so Vercel previews and stage need
 * no code change. Without the variable: the site, plus the local frontend everywhere but production,
 * where a default that answers `localhost` is one nobody meant to ship.
 */
export function corsOrigins(env: NodeJS.ProcessEnv = process.env): string[] {
    const listed = (env.CORS_ORIGINS ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0);
    if (listed.length > 0) return listed;
    return env.NODE_ENV === 'production' ? [SITE_ORIGIN] : [SITE_ORIGIN, LOCAL_ORIGIN];
}

/**
 * Whether `/api` serves the Swagger UI and `swagger.json` is written. On everywhere but production,
 * where a map of every route and every DTO is a gift to whoever is probing the API and of no use to
 * a family; `SWAGGER_ENABLED=true` turns it back on for an afternoon, `false` turns it off anywhere.
 */
export function swaggerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
    if (env.SWAGGER_ENABLED === 'true') return true;
    if (env.SWAGGER_ENABLED === 'false') return false;
    return env.NODE_ENV !== 'production';
}

/**
 * The JSON body limit. Express's default, 100 KB, is below a bank statement the reconciliation page
 * accepts: 90,000 characters of CSV (`ImportStatementDto`) grow once JSON-escaped — every quote and
 * line break doubles, every diacritic is two bytes —, so a statement near the cap was refused with
 * "eroare pe server" (review of 27 September 2026). Half a megabyte covers it and stays small.
 */
export const JSON_BODY_LIMIT = '512kb';
