import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { RequestWithId } from './request-id.middleware';
import { redactUrl } from './redact-url';

/**
 * One shape for every error leaving the API.
 *
 * Before this, an error looked different depending on whether Nest, TypeORM or a `throw` in a
 * service produced it, so the frontend had nothing to rely on. Worse, a TypeORM failure went out
 * as a 500 carrying the driver's message — table names, column names and SQL included.
 */
export interface ErrorResponse {
    statusCode: number;
    /** Stable, machine-readable. The frontend switches on this, never on `message`. */
    code: string;
    message: string;
    requestId: string;
    path: string;
    timestamp: string;
    /** Per-field problems, present only on validation failures. */
    details?: string[];
}

/** Postgres error codes worth translating into something a caller can act on. */
const PG_UNIQUE_VIOLATION = '23505';
const PG_FOREIGN_KEY_VIOLATION = '23503';
const PG_NOT_NULL_VIOLATION = '23502';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger = new Logger('Exception');

    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();
        const requestId = (request as RequestWithId).requestId ?? 'unknown';

        const body = this.toErrorResponse(exception, request, requestId);

        // 5xx means we broke; log the cause with the id so the response can be traced back to it.
        // 4xx is the caller's problem and would otherwise be an easy way to flood the logs.
        if (body.statusCode >= 500) {
            this.logger.error(
                `${body.requestId} ${request.method} ${request.url} -> ${body.statusCode} ${body.code}`,
                exception instanceof Error ? exception.stack : String(exception),
            );
        }

        response.status(body.statusCode).json(body);
    }

    private toErrorResponse(exception: unknown, request: Request, requestId: string): ErrorResponse {
        // Redacted with the same rule the logger uses: an error body is seen by more places than a
        // server log, so it cannot be the less careful of the two.
        const base = { requestId, path: redactUrl(request.url), timestamp: new Date().toISOString() };

        if (exception instanceof HttpException) {
            const statusCode = exception.getStatus();
            const payload = exception.getResponse();

            // The ValidationPipe puts its per-field messages in `message` as an array.
            if (typeof payload === 'object' && payload !== null) {
                const { message, error } = payload as { message?: string | string[]; error?: string };
                if (Array.isArray(message)) {
                    return {
                        ...base,
                        statusCode,
                        code: 'VALIDATION_FAILED',
                        message: 'Request validation failed',
                        details: message,
                    };
                }
                return { ...base, statusCode, code: this.codeFor(statusCode, error), message: message ?? exception.message };
            }

            return { ...base, statusCode, code: this.codeFor(statusCode), message: String(payload) };
        }

        if (exception instanceof QueryFailedError) {
            return { ...base, ...this.fromDatabaseError(exception as QueryFailedError<Error>) };
        }

        return {
            ...base,
            statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
            code: 'INTERNAL_ERROR',
            message: 'Internal server error',
        };
    }

    /**
     * Database failures never reach the client verbatim. A unique violation is a 409 the caller can
     * act on; everything else is a 500 with a generic message, because the driver's text names
     * tables and columns.
     */
    private fromDatabaseError(error: QueryFailedError): Pick<ErrorResponse, 'statusCode' | 'code' | 'message'> {
        const pgCode = (error as unknown as { code?: string }).code;

        switch (pgCode) {
            case PG_UNIQUE_VIOLATION:
                return { statusCode: HttpStatus.CONFLICT, code: 'ALREADY_EXISTS', message: 'A record with these values already exists' };
            case PG_FOREIGN_KEY_VIOLATION:
                return {
                    statusCode: HttpStatus.BAD_REQUEST,
                    code: 'RELATED_RECORD_MISSING',
                    message: 'A referenced record does not exist',
                };
            case PG_NOT_NULL_VIOLATION:
                return { statusCode: HttpStatus.BAD_REQUEST, code: 'MISSING_REQUIRED_FIELD', message: 'A required field was missing' };
            default:
                return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, code: 'DATABASE_ERROR', message: 'Internal server error' };
        }
    }

    private codeFor(statusCode: number, error?: string): string {
        const known: Record<number, string> = {
            [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
            [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
            [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
            [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
            [HttpStatus.CONFLICT]: 'CONFLICT',
            [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
        };
        return known[statusCode] ?? (error ? error.toUpperCase().replace(/\s+/g, '_') : 'ERROR');
    }
}
