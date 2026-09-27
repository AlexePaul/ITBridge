import { execFileSync } from 'node:child_process';

/** The commit a process runs — the version line on `/admin/sistem`, and on every error occurrence. */
export interface RunningVersion {
    /** The full SHA, or `null` where there is no git to ask. */
    commit: string | null;
    /** When that commit was made, ISO 8601; `null` with it. */
    committedAt: string | null;
}

const UNKNOWN: RunningVersion = { commit: null, committedAt: null };

let read: RunningVersion | undefined;

/**
 * Which commit this process runs, asked of git once and remembered — "has my fix reached stage?".
 *
 * **Asked at boot** (`SystemStatusService.onModuleInit`), not at the first read: `deploy.sh` pulls,
 * builds and reloads, so a checkout pulled again after the reload would otherwise name a commit this
 * process never loaded. **And asked of git, not of a file written at build**: turbo restores a cached
 * `dist/` whenever the API's sources did not change, so a file written by the build would name an
 * older commit after every deploy that changed only the site or the docs — the answer would be wrong
 * exactly when someone checks whether a deploy happened.
 *
 * `null` where nothing can say — no git on the machine, a checkout git refuses to read (owned by
 * another user) — rather than a guess: the page then says it does not know, and the runbook says why.
 */
export function runningVersion(): RunningVersion {
    read ??= readRunningVersion();
    return read;
}

/** The asking itself, with git replaceable so the answer to a failure can be tested. */
export function readRunningVersion(run: typeof execFileSync = execFileSync): RunningVersion {
    try {
        const output = run('git', ['log', '-1', '--format=%H%n%cI'], {
            cwd: __dirname,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
            timeout: 2000,
        });
        const [commit, committedAt] = String(output).trim().split('\n');
        return /^[0-9a-f]{40}$/.test(commit ?? '') ? { commit, committedAt: committedAt || null } : UNKNOWN;
    } catch {
        return UNKNOWN;
    }
}
