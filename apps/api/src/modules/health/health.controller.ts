import { Controller, Get, HttpCode, HttpStatus, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

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
@Controller()
export class HealthController {
    private readonly logger = new Logger('Health');

    constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

    @Get('health')
    @HttpCode(HttpStatus.OK)
    @ApiResponse({ status: 200, description: 'The process is running' })
    health(): { status: 'ok'; uptime: number } {
        return { status: 'ok', uptime: Math.floor(process.uptime()) };
    }

    @Get('ready')
    @ApiResponse({ status: 200, description: 'Dependencies reachable' })
    @ApiResponse({ status: 503, description: 'A dependency is unreachable' })
    async ready(): Promise<{ status: 'ready'; checks: Record<string, 'ok'> }> {
        const checks: Record<string, 'ok'> = {};

        try {
            await this.dataSource.query('SELECT 1');
            checks.database = 'ok';
        } catch (error) {
            // The cause is logged here and nowhere else: the filter only ever sees the
            // ServiceUnavailableException below, so without this line an operator learns that
            // readiness failed and nothing about why — which is the one thing the probe is for.
            this.logger.error('Readiness check failed', error instanceof Error ? error.stack : String(error));

            // The response stays bare: a readiness probe is reachable without credentials, so it
            // says whether we are ready, not why not.
            throw new ServiceUnavailableException('Database unreachable');
        }

        return { status: 'ready', checks };
    }
}
