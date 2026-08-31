import * as path from 'path';

/**
 * Everything the agent needs to know, read once at startup. E14/S2.
 *
 * From environment variables rather than a config file, and the values live in a `.env` next to the
 * executable that Node loads itself. The alternative — a JSON file the agent parses — would be one
 * more thing to get wrong on a machine nobody logs into, and the password has to stay out of
 * anything that might be copied around.
 */
export interface AgentConfig {
    /** Where the API lives. No trailing slash. */
    apiBase: string;
    /** The dedicated account the agent signs in as. See the README for why it has the ADMIN role. */
    username: string;
    password: string;
    /** The share, as this machine sees it: `P:\Proiecte` or `\\\\SRV\\Proiecte`. */
    root: string;
    /** Which agent this is, in the heartbeat. One row per name on the server. */
    name: string;
    /** How often the folders are walked. */
    scanIntervalMs: number;
    /** How often the folder tree is rebuilt from the database. */
    mirrorIntervalMs: number;
    /** How often the agent says it is alive. Well under the three hours the interface calls stale. */
    heartbeatIntervalMs: number;
    /** Where the rotated refresh token is kept between restarts. */
    statePath: string;
    /**
     * How long a file has to have been still before it is uploaded.
     *
     * A program that is still writing a large `.sb3` would otherwise be caught halfway, and half a
     * file uploads perfectly happily — it is only unreadable later, in a parent's hands. Two
     * consecutive looks with the same size and modification time is the cheap version of that check
     * and it does not need to open the file.
     */
    quietPeriodMs: number;
}

/** Sensible everywhere, and the only ones a school would ever need to change are the first four. */
const DEFAULTS = {
    scanIntervalMs: 30_000,
    mirrorIntervalMs: 15 * 60_000,
    heartbeatIntervalMs: 5 * 60_000,
    quietPeriodMs: 20_000,
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AgentConfig {
    const missing = [
        'ITBRIDGE_API_BASE',
        'ITBRIDGE_AGENT_USERNAME',
        'ITBRIDGE_AGENT_PASSWORD',
        'ITBRIDGE_AGENT_ROOT',
    ].filter((name) => !env[name]);
    if (missing.length > 0) {
        // Refusing to start is the right failure. An agent that comes up without a share path would
        // sit there heartbeating cheerfully while nothing is ever uploaded — which is precisely the
        // ambiguous silence the heartbeat exists to remove.
        throw new Error(`Missing configuration: ${missing.join(', ')}. See apps/agent/README.md.`);
    }

    return {
        apiBase: env.ITBRIDGE_API_BASE!.replace(/\/+$/, ''),
        username: env.ITBRIDGE_AGENT_USERNAME!,
        password: env.ITBRIDGE_AGENT_PASSWORD!,
        root: env.ITBRIDGE_AGENT_ROOT!,
        name: env.ITBRIDGE_AGENT_NAME || 'birou',
        scanIntervalMs: intOr(env.ITBRIDGE_AGENT_SCAN_INTERVAL_MS, DEFAULTS.scanIntervalMs),
        mirrorIntervalMs: intOr(env.ITBRIDGE_AGENT_MIRROR_INTERVAL_MS, DEFAULTS.mirrorIntervalMs),
        heartbeatIntervalMs: intOr(env.ITBRIDGE_AGENT_HEARTBEAT_INTERVAL_MS, DEFAULTS.heartbeatIntervalMs),
        quietPeriodMs: intOr(env.ITBRIDGE_AGENT_QUIET_PERIOD_MS, DEFAULTS.quietPeriodMs),
        statePath: env.ITBRIDGE_AGENT_STATE_PATH || path.join(process.cwd(), 'state.json'),
    };
}

function intOr(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
