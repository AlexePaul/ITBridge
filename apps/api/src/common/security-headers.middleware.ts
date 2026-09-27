import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

/**
 * What every API response carries — the other origin's half of what the public site already sends
 * from Nuxt (`routeRules` in `apps/web/nuxt.config.ts`).
 *
 * In code rather than in the proxy, because the proxy's configuration is not in this repository
 * (`/srv/itbridge` on the instance, CLAUDE.md) and a header nobody can read in review is a header
 * nobody notices is missing — HSTS sat on the launch list as "yours to set on the host".
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
    // A year of HTTPS-only once a browser has met the API over TLS. Browsers ignore the header on
    // plain HTTP, so `pnpm dev` and the CI runs on 127.0.0.1 are untouched. No `includeSubDomains`:
    // the API does not speak for the school's other hosts.
    'strict-transport-security': 'max-age=31536000',
    'x-content-type-options': 'nosniff',
    // Nothing embeds the API. The portal shows an invoice PDF from a blob URL of its own, which
    // neither header reaches.
    'x-frame-options': 'DENY',
    'content-security-policy': "frame-ancestors 'none'",
    'referrer-policy': 'no-referrer',
};

/**
 * Personal data by default. A family's invoices read on the office's shared computer must not stay
 * in its disk cache for the next person at the desk. A handler that wants caching says so with its
 * own `Cache-Control` — the project thumbnail does, `@Header(...)` — which replaces this one.
 */
export const DEFAULT_CACHE_CONTROL = 'no-store';

@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
    use(_req: Request, res: Response, next: NextFunction): void {
        for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
        res.setHeader('cache-control', DEFAULT_CACHE_CONTROL);
        // Express announces itself before any middleware of ours runs; the name is a gift to
        // whoever is fingerprinting the host, and of no use to a family.
        res.removeHeader('x-powered-by');
        next();
    }
}
