import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';
import { randomUUID } from 'crypto';
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
/** A value that could not be cast to its column type — always the caller's doing, never ours. */
const PG_INVALID_TEXT_REPRESENTATION = '22P02';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger = new Logger('Exception');

    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();
        // Minted here when the middleware never ran. Express rejects a malformed JSON body inside
        // its own body parser, which sits ahead of Nest's middleware, so those requests reached the
        // filter with no id at all and every one of them was reported as `"unknown"` — precisely
        // the requests hardest to trace, all sharing one useless correlation id.
        const requestId = (request as RequestWithId).requestId ?? randomUUID();

        const body = this.toErrorResponse(exception, request, requestId);

        // 5xx means we broke; log the cause with the id so the response can be traced back to it.
        // 4xx is the caller's problem and would otherwise be an easy way to flood the logs.
        if (body.statusCode >= 500) {
            this.logger.error(
                // `body.path`, not `request.url`: the body is redacted and this line was not, so the
                // log kept the clear-text copy of exactly what the response had just hidden.
                `${body.requestId} ${request.method} ${body.path} -> ${body.statusCode} ${body.code}`,
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
                return { ...base, statusCode, code: this.codeFor(statusCode, error), message: this.safeMessage(message ?? exception.message, request) };
            }

            return { ...base, statusCode, code: this.codeFor(statusCode), message: this.safeMessage(String(payload), request) };
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
            case PG_FOREIGN_KEY_VIOLATION: {
                // The same code covers two opposite situations: pointing at a row that is not there
                // (the caller sent a bad id — 400), and deleting a row something else still points
                // at (the caller's request conflicts with existing data — 409). Reporting the
                // second as "a referenced record does not exist" told an admin the exact opposite
                // of what happened.
                const isDelete = /^\s*delete\b/i.test((error as unknown as { query?: string }).query ?? '');
                return isDelete
                    ? {
                          statusCode: HttpStatus.CONFLICT,
                          code: 'STILL_REFERENCED',
                          message: 'This record is still referenced by other records',
                      }
                    : {
                          statusCode: HttpStatus.BAD_REQUEST,
                          code: 'RELATED_RECORD_MISSING',
                          message: 'A referenced record does not exist',
                      };
            }
            case PG_NOT_NULL_VIOLATION:
                return { statusCode: HttpStatus.BAD_REQUEST, code: 'MISSING_REQUIRED_FIELD', message: 'A required field was missing' };
            case PG_INVALID_TEXT_REPRESENTATION:
                // Reported as a 500 before, which told the client the server had broken over a
                // value it had sent itself — and logged a stack into the channel meant for faults.
                return { statusCode: HttpStatus.BAD_REQUEST, code: 'INVALID_VALUE', message: 'A field had a value of the wrong type' };
            default:
                return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, code: 'DATABASE_ERROR', message: 'Internal server error' };
        }
    }

    /**
     * Keeps a framework-generated message from undoing the redaction applied to `path`.
     *
     * Nest's not-found handler throws `Cannot GET ${req.originalUrl}`, so a 404 answered with a
     * redacted `path` and, in the same JSON object, a `message` carrying the raw query string —
     * email and token in the clear. Any message that embeds the request URL gets the redacted one.
     */
    private safeMessage(message: string, request: Request): string {
        const raw = request.originalUrl || request.url;
        if (!raw || !message.includes(raw)) return message;
        return message.split(raw).join(redactUrl(raw));
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
        // `error` wins over the status default, so a service can name *which* conflict it hit:
        // `new ConflictException({ message, error: 'GROUP_SLOT_TAKEN' })`. The frontend has one
        // Romanian sentence per code, and "there is already a record with these values" is not a
        // useful thing to tell an admin who has just double-booked a room.
        //
        // This does not change the codes anything already emits. Nest fills `error` with the
        // status text — 'Conflict', 'Not Found' — and normalising those gives back exactly the
        // entries in the map above.
        if (error) return error.toUpperCase().replace(/\s+/g, '_');
        return known[statusCode] ?? 'ERROR';
    }
}
