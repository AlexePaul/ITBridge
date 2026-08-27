import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

/** Header carrying the correlation id, both inbound and outbound. */
export const REQUEST_ID_HEADER = 'x-request-id';

export interface RequestWithId extends Request {
    requestId: string;
}

/**
 * Stamps every request with an id and echoes it back on the response.
 *
 * An id supplied by the caller is kept — that is how a correlation id survives a hop from the
 * frontend — but only when it looks like an id, so a client cannot inject arbitrary text into the
 * logs.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
    use(req: Request, res: Response, next: NextFunction): void {
        const supplied = req.headers[REQUEST_ID_HEADER];
        const candidate = Array.isArray(supplied) ? supplied[0] : supplied;

        const requestId = candidate && /^[\w-]{8,64}$/.test(candidate) ? candidate : randomUUID();

        (req as RequestWithId).requestId = requestId;
        res.setHeader(REQUEST_ID_HEADER, requestId);
        next();
    }
}
