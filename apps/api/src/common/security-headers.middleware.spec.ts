import { SecurityHeadersMiddleware, SECURITY_HEADERS, DEFAULT_CACHE_CONTROL } from './security-headers.middleware';
import type { NextFunction, Request, Response } from 'express';

describe('SecurityHeadersMiddleware', () => {
    const run = () => {
        const headers = new Map<string, string>([['x-powered-by', 'Express']]);
        const res = {
            setHeader: jest.fn((name: string, value: string) => headers.set(name.toLowerCase(), value)),
            removeHeader: jest.fn((name: string) => headers.delete(name.toLowerCase())),
        };
        const next = jest.fn();
        new SecurityHeadersMiddleware().use({} as Request, res as unknown as Response, next as NextFunction);
        return { headers, next };
    };

    it('sets every hardening header, and HSTS without speaking for other hosts', () => {
        const { headers } = run();
        for (const [name, value] of Object.entries(SECURITY_HEADERS)) expect(headers.get(name)).toBe(value);
        expect(headers.get('strict-transport-security')).not.toContain('includeSubDomains');
    });

    it('keeps responses out of caches unless a handler says otherwise', () => {
        expect(run().headers.get('cache-control')).toBe(DEFAULT_CACHE_CONTROL);
    });

    it('stops announcing Express, and lets the request through', () => {
        const { headers, next } = run();
        expect(headers.has('x-powered-by')).toBe(false);
        expect(next).toHaveBeenCalledTimes(1);
    });
});
