import * as fs from 'fs';
import * as path from 'path';
import { Agent, AGENT_VERSION } from './agent';
import { ApiClient } from './api-client';
import { loadConfig } from './config';
import { log } from './log';

/**
 * The entry point. E14/S2.
 *
 * Kept to almost nothing on purpose: everything it does is construct three objects and hand control
 * to `Agent`, so the loop can be exercised in a test without a process, a share or a server.
 */

/**
 * Configuration comes from a `.env` next to the executable when there is one.
 *
 * `process.loadEnvFile` is built into Node 22, so this costs no dependency. Absent file is the
 * normal case in development, where the variables are already in the environment — hence the empty
 * catch rather than a warning nobody would act on.
 */
function loadEnvFile(): void {
    const file = path.join(process.cwd(), '.env');
    if (!fs.existsSync(file)) return;
    try {
        process.loadEnvFile(file);
    } catch (error) {
        log.warn(`Could not read .env: ${error instanceof Error ? error.message : String(error)}`);
    }
}

async function main(): Promise<void> {
    loadEnvFile();
    const config = loadConfig();
    const agent = new Agent(config, new ApiClient(config));

    log.info(`IT Bridge upload agent ${AGENT_VERSION}, reporting as "${config.name}".`);

    // Windows stops a service by signalling the process. Clearing the timers lets an upload that is
    // already in flight finish rather than being cut off halfway — the file would survive either
    // way, since it is only moved out of the folder after the server has accepted it, but a killed
    // upload wastes the transfer and the next pass would repeat it.
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.on(signal, () => {
            log.info(`${signal} received, stopping.`);
            agent.stop();
            process.exit(0);
        });
    }

    await agent.start();
}

void main().catch((error: unknown) => {
    // Refusing to start is deliberate and the exit code matters: a service wrapper restarts on a
    // non-zero exit, which is right for a transient failure and, for a missing password, produces a
    // restart loop with the reason in the log — visible, rather than an agent that runs and
    // uploads nothing.
    log.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
});
