import * as fs from 'fs';
import type { AgentMirror } from '@itbridge/types';
import { ApiClient } from './api-client';
import type { AgentConfig } from './config';
import { applyMirror } from './mirror';
import { scan } from './scanner';
import { handleRejected, uploadFile } from './uploader';
import { log } from './log';

/** Reported in the heartbeat, so an admin looking at a stale agent can tell which build it is. */
export const AGENT_VERSION = '0.1.0';

/**
 * The loop. E14/S2.
 *
 * Three timers, deliberately at three different speeds:
 *
 *  - **Scan**, every thirty seconds. This is what makes "a file saved during a class appears on the
 *    group screen in under a minute" true.
 *  - **Mirror**, every fifteen minutes. Groups and children change on the scale of weeks; rebuilding
 *    the tree every half minute would be a directory listing of the whole share for nothing.
 *  - **Heartbeat**, every five minutes. Far below the three hours at which the interface starts
 *    saying the agent has gone quiet, so a single missed beat is never an alarm.
 *
 * **Polling, not `fs.watch`.** Change notifications over SMB are unreliable in exactly the way that
 * matters here — they are silently dropped rather than delayed — and a missed event is a file that
 * never uploads. A directory walk of a share holding a few dozen folders is cheap, and it recovers
 * from a network blip by itself.
 *
 * **One pass at a time.** A slow upload must not let ticks pile up behind it; the next tick simply
 * returns, and the file is still in the folder.
 */
export class Agent {
    private mirror: AgentMirror = { locations: [] };
    private running = false;
    private lastError: string | null = null;
    private pendingFiles = 0;
    private timers: NodeJS.Timeout[] = [];

    constructor(
        private readonly config: AgentConfig,
        private readonly api: ApiClient,
    ) {}

    async start(): Promise<void> {
        this.warnIfRootUnreachable();
        await this.api.authenticate();
        await this.refreshMirror();
        await this.pass();
        await this.beat();

        this.timers.push(
            setInterval(() => void this.pass(), this.config.scanIntervalMs),
            setInterval(() => void this.refreshMirror(), this.config.mirrorIntervalMs),
            setInterval(() => void this.beat(), this.config.heartbeatIntervalMs),
        );

        log.info(`Watching ${this.config.root} every ${Math.round(this.config.scanIntervalMs / 1000)}s.`);
    }

    stop(): void {
        for (const timer of this.timers) clearInterval(timer);
        this.timers = [];
    }

    /**
     * One pass: look, upload, tidy.
     *
     * Sequential rather than parallel. The office machine is uploading over a school connection to
     * an API that shares an instance with Postgres, and ten concurrent twenty-megabyte uploads help
     * nobody — least of all the parent whose screen is being served at the same time. Nothing here
     * is in a hurry: it runs in an office, not in front of somebody waiting.
     */
    async pass(): Promise<void> {
        if (this.running) return;
        this.running = true;

        try {
            const result = scan(this.config.root, this.mirror, new Date(), this.config.quietPeriodMs);
            this.pendingFiles = result.files.length + result.rejected.length;

            let uploaded = 0;
            let failed = 0;

            for (const file of result.files) {
                const outcome = await uploadFile(this.api, file);
                if (outcome === 'failed') failed++;
                else uploaded++;
            }

            for (const rejected of result.rejected) {
                await handleRejected(this.api, rejected);
            }

            if (uploaded > 0 || result.rejected.length > 0) {
                log.info(`Pass: ${uploaded} uploaded, ${result.rejected.length} unassigned, ${failed} failed.`);
            }

            this.pendingFiles = failed;
            // Cleared on a clean pass, so a problem that has been fixed stops being reported. An
            // error that lingers after its cause is gone teaches an admin to ignore the field.
            this.lastError = failed > 0 ? `${failed} file(s) could not be uploaded on the last pass` : null;
        } catch (error) {
            // The share being unreachable lands here. It is a temporary condition and the heartbeat
            // carries it, so an admin sees a reason rather than an agent that has simply gone quiet.
            this.lastError = error instanceof Error ? error.message : String(error);
            log.error(`Pass failed: ${this.lastError}`);
        } finally {
            this.running = false;
        }
    }

    /**
     * Says something useful when the watched folder is not there, and carries on anyway.
     *
     * A warning rather than a refusal: the share can be briefly unreachable at boot, before the
     * network is up, and an agent that gave up then would stay down until somebody noticed. The
     * mirror creates the folder if it can, the pass fails harmlessly if it cannot, and the heartbeat
     * carries the reason either way.
     *
     * The message names the trap it is almost always hiding. `P:\Proiecte` works when you type it
     * and not at all from a task started at boot, because a mapped drive letter belongs to a
     * logged-in session and a task at boot has none — so the agent comes up, beats healthily and
     * uploads nothing, which is precisely the ambiguous silence the heartbeat exists to remove.
     */
    private warnIfRootUnreachable(): void {
        if (fs.existsSync(this.config.root)) return;

        log.warn(`The watched folder ${this.config.root} is not reachable right now.`);
        if (/^[A-Za-z]:/.test(this.config.root)) {
            log.warn(
                'If that is a mapped network drive, a service cannot see it: use the UNC path, or run on the machine that hosts the folder.',
            );
        }
    }

    private async refreshMirror(): Promise<void> {
        try {
            this.mirror = await this.api.mirror();
            const { created, renamed } = applyMirror(this.config.root, this.mirror);
            if (created > 0 || renamed > 0) {
                log.info(`Mirror: ${created} folder(s) created, ${renamed} renamed.`);
            }
        } catch (error) {
            // The previous tree stays in memory, so a passing outage does not stop uploads: the
            // groups and children have not changed in the last fifteen minutes either way.
            this.lastError = error instanceof Error ? error.message : String(error);
            log.error(`Could not refresh the mirror: ${this.lastError}`);
        }
    }

    private async beat(): Promise<void> {
        try {
            await this.api.heartbeat({
                pendingFiles: this.pendingFiles,
                lastError: this.lastError,
                version: AGENT_VERSION,
            });
        } catch (error) {
            // A failed heartbeat is not worth a retry of its own: the next one is five minutes away,
            // and the silence it leaves is exactly the signal the interface is watching for.
            log.warn(`Heartbeat failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
