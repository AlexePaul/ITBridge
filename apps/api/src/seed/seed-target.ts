/**
 * Which database `pnpm seed` is allowed to wipe, and with what password — E04/S3, extended.
 *
 * A pure function so the rule can be asserted without a database behind it, in the house style. It
 * exists because the seed does two things that are entirely reasonable on a laptop and entirely
 * unreasonable anywhere else: it **truncates every table**, and it sets every account's password to
 * a constant that is checked into this repository.
 *
 * Staging is the first target that is neither. It is a real host, reachable over a network, holding
 * data that looks like a school's — so both assumptions have to be made explicit rather than
 * inherited from the localhost case.
 */

/** Hosts that can only be the developer's own machine, or the compose service beside it. */
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', 'postgres'];

export interface SeedTarget {
    host: string;
    database: string;
}

export type SeedVerdict = { ok: true; password: string } | { ok: false; reason: string };

export function isLocalHost(host: string): boolean {
    return LOCAL_HOSTS.includes(host);
}

/** The password used on a local database, where a constant in the repo is the convenient answer. */
export const LOCAL_PASSWORD = 'parola123';

/**
 * Decides whether this database may be seeded, and with which password.
 *
 * Local: anything goes, and the password is the familiar constant — that is the whole point of a
 * development seed, and nobody but the developer can reach it.
 *
 * Non-local, and both conditions are refusals rather than warnings:
 *
 * 1. **`SEED_ALLOW_NON_LOCAL` must name the database**, not say "yes". A boolean was enough while
 *    the only non-local target was hypothetical; on a staging runner the variable lives permanently
 *    in an environment file, and from that moment it authorises whatever `DB_NAME` happens to say —
 *    including a production database reached by a typo. Naming the database means the grant can
 *    only ever authorise the one somebody meant, however long it sits there.
 * 2. **`SEED_PASSWORD` must be set.** `parola123` is in this repository and in its README; on a
 *    host anybody can reach, seeding with it publishes an admin account. There is no sensible
 *    default here — a generated one would be lost by the time somebody wanted to sign in — so the
 *    seed refuses and says which variable is missing.
 */
export function checkSeedTarget(target: SeedTarget, env: NodeJS.ProcessEnv = process.env): SeedVerdict {
    if (isLocalHost(target.host)) {
        // `pnpm seed:stage` sets `SEED_TARGET=stage`, and reaching a local host from it means the
        // connection details never arrived — `dotenv -e .env.stage` does **not** fail when the file
        // is missing, it loads nothing, and `data-source.ts` then falls back to localhost. Without
        // this the command would quietly truncate the developer's own database while they watched
        // for staging to fill up: the exact wrong-target failure the rest of this file prevents,
        // walked in through the front door.
        if (env.SEED_TARGET === 'stage') {
            return {
                ok: false,
                reason:
                    `\`pnpm seed:stage\` resolved to a local database (host: ${target.host}, database: ${target.database}), which would ` +
                    `wipe your development data instead of staging. Copy \`.env.stage.example\` to \`.env.stage\` and fill in DB_HOST, ` +
                    `DB_NAME, SEED_ALLOW_NON_LOCAL and SEED_PASSWORD — a missing \`.env.stage\` loads nothing and falls back to localhost.`,
            };
        }
        return { ok: true, password: env.SEED_PASSWORD || LOCAL_PASSWORD };
    }

    const allowed = env.SEED_ALLOW_NON_LOCAL;
    if (!allowed) {
        return {
            ok: false,
            reason:
                `Refusing to seed a non-local database (host: ${target.host || 'unset'}, database: ${target.database || 'unset'}). ` +
                `This command deletes every row. Set SEED_ALLOW_NON_LOCAL="${target.database}" if you really mean it.`,
        };
    }

    if (allowed !== target.database) {
        return {
            ok: false,
            reason:
                `SEED_ALLOW_NON_LOCAL authorises "${allowed}", but this connection points at "${target.database}" ` +
                `(host: ${target.host}). Refusing — the grant names one database on purpose, so that a variable left ` +
                `in an environment file cannot authorise the next one somebody points it at.`,
        };
    }

    const password = env.SEED_PASSWORD;
    if (!password) {
        return {
            ok: false,
            reason:
                `Refusing to seed "${target.database}" without SEED_PASSWORD. Every seeded account would get the ` +
                `password published in this repository, on a host that is not your laptop.`,
        };
    }

    return { ok: true, password };
}
