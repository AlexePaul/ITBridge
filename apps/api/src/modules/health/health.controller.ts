import { Controller, Get, HttpCode, HttpStatus, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { S3Service } from 'src/modules/storage/s3.service';

/** A probe that waits forever is worse than one that says "not ready" — see `withTimeout`. */
const CHECK_TIMEOUT_MS = 2_000;

/**
 * Fails a check that does not answer in time, instead of waiting on it.
 *
 * A stopped database refuses the connection and fails in milliseconds, which is the easy case. A
 * *hung* one — paused container, saturated pool, network black hole — accepts the socket and never
 * replies, and `SELECT 1` has no timeout of its own, so `/ready` used to hang indefinitely rather
 * than report unhealthy. Verified: with the database process paused, the endpoint returned nothing
 * at all after twenty seconds. A readiness probe has to fail fast or it is not a probe.
 */
async function withTimeout<T>(work: Promise<T>, label: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
        return await Promise.race([
            work,
            new Promise<never>((_resolve, reject) => {
                timer = setTimeout(() => reject(new Error(`${label} check timed out after ${CHECK_TIMEOUT_MS}ms`)), CHECK_TIMEOUT_MS);
            }),
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/**
 * Two endpoints with different jobs, deliberately.
 *
 * `/health` answers whether the process is alive, and touches nothing — PM2 and an uptime checker
 * poll it constantly, so a check that queried the database would turn a slow database into a
 * restart loop.
 *
 * `/ready` answers whether the process can actually serve traffic, so it does check dependencies.
 * Both are public: a checker has no credentials, and neither reveals anything.
 */
@SkipThrottle()
@Controller()
export class HealthController {
    private readonly logger = new Logger('Health');

    constructor(
        @InjectDataSource() private readonly dataSource: DataSource,
        private readonly s3Service: S3Service,
    ) {}

    @Get('health')
    @HttpCode(HttpStatus.OK)
    @ApiResponse({ status: 200, description: 'The process is running' })
    health(): { status: 'ok'; uptime: number } {
        return { status: 'ok', uptime: Math.floor(process.uptime()) };
    }

    /**
     * `@SkipThrottle()` on the class matters here: these endpoints share the global 300/60s bucket
     * with real traffic, and behind a proxy every request counts against one key. A liveness probe
     * polling once a second would eat a fifth of the budget and could end up throttling itself —
     * PM2 reads a 429 as a dead process and restarts it.
     */
    @Get('ready')
    @ApiResponse({ status: 200, description: 'Dependencies reachable' })
    @ApiResponse({ status: 503, description: 'A dependency is unreachable' })
    async ready(): Promise<{ status: 'ready'; checks: Record<string, 'ok'> }> {
        const checks: Record<string, 'ok'> = {};

        try {
            await withTimeout(this.dataSource.query('SELECT 1'), 'database');
            checks.database = 'ok';
        } catch (error) {
            // The cause is logged here and nowhere else: the filter only ever sees the
            // ServiceUnavailableException below, so without this line an operator learns that
            // readiness failed and nothing about why — which is the one thing the probe is for.
            this.logger.error('Readiness check failed: database', error instanceof Error ? error.stack : String(error));

            // The response stays bare: a readiness probe is reachable without credentials, so it
            // says whether we are ready, not why not.
            throw new ServiceUnavailableException('A dependency is unreachable');
        }

        // Object storage is the other dependency issuing an invoice cannot do without, and E05/S5
        // scoped it from the start. Checked here rather than left to the first failing upload.
        try {
            const reachable = await withTimeout(this.s3Service.isReachable(), 'object storage');
            if (!reachable) throw new Error('bucket not reachable');
            checks.objectStorage = 'ok';
        } catch (error) {
            this.logger.error('Readiness check failed: object storage', error instanceof Error ? error.stack : String(error));
            throw new ServiceUnavailableException('A dependency is unreachable');
        }

        return { status: 'ready', checks };
    }
}
