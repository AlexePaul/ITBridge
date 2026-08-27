import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { RequestWithId } from './request-id.middleware';
import { redactUrl } from './redact-url';

/**
 * One line per request: method, route, status, duration, user, correlation id.
 *
 * There was no logging on the backend at all, so an incident left nothing to read. The id is the
 * same one the error response carries, which is what makes a report from a parent traceable to the
 * request that caused it.
 *
 * Deliberately not the request or response body: those carry names, emails and passwords, and a log
 * is the easiest place to leak personal data without noticing.
 */
@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
    private readonly logger = new Logger('Request');

    use(req: Request, res: Response, next: NextFunction): void {
        const startedAt = process.hrtime.bigint();

        res.on('finish', () => {
            const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
            const requestId = (req as RequestWithId).requestId ?? '-';
            const userId = (req as { user?: { sub?: number } }).user?.sub ?? '-';

            const line = JSON.stringify({
                requestId,
                method: req.method,
                path: redactUrl(req.originalUrl),
                statusCode: res.statusCode,
                durationMs: Math.round(durationMs * 100) / 100,
                userId,
            });

            // Client errors are noise at info level but matter when something is wrong; server
            // errors always matter.
            if (res.statusCode >= 500) this.logger.error(line);
            else if (res.statusCode >= 400) this.logger.warn(line);
            else this.logger.log(line);
        });

        next();
    }
}
