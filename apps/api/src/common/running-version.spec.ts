import { execFileSync } from 'node:child_process';
import { readRunningVersion, runningVersion } from './running-version';

/** What git says here, or null where it cannot answer — the same two outcomes the code has. */
function gitHead(): string | null {
    try {
        return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: __dirname, encoding: 'utf8' }).trim();
    } catch {
        return null;
    }
}

describe('runningVersion', () => {
    it('names the commit the checkout is on, with the day it was made, and asks only once', () => {
        const version = runningVersion();
        expect(version.commit).toBe(gitHead());
        if (version.commit) expect(Number.isNaN(Date.parse(version.committedAt ?? ''))).toBe(false);
        expect(runningVersion()).toBe(version);
    });

    it('says it does not know, rather than guess, when git cannot answer', () => {
        const missing = (() => {
            throw new Error('spawn git ENOENT');
        }) as unknown as typeof execFileSync;
        expect(readRunningVersion(missing)).toEqual({ commit: null, committedAt: null });
    });

    it('does not take anything but a full SHA for a commit', () => {
        const refusal = (() => 'fatal: detected dubious ownership in repository\n') as unknown as typeof execFileSync;
        expect(readRunningVersion(refusal)).toEqual({ commit: null, committedAt: null });
    });
});
