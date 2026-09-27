import { ErrorSource } from 'src/enum/error-source.enum';
import { fingerprint, normaliseMessage, occurrencePath, parseLogCall, routeOf, scrub, throwSite, withOccurrence } from './error-report.rules';

describe('error record rules', () => {
    describe('scrub', () => {
        it.each([
            ['Key (email)=(ana.pop@example.com) already exists.', 'Key (email)=(…) already exists.'],
            ['Key ("phone")=(+40712345678) already exists.', 'Key ("phone")=(…) already exists.'],
            ['mail to Ana.Pop@Gmail.com bounced', 'mail to [email] bounced'],
            ['call 0712 345 678 or +40 712-345-678', 'call [telefon] or [telefon]'],
            ['the office on 021 123 4567', 'the office on [telefon]'],
            ['transfer to RO49AAAA1B31007593840000 failed', 'transfer to [iban] failed'],
            ['Authorization: Bearer abc.def-ghi', 'Authorization: Bearer [token]'],
            ['token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjF9.c2lnbmF0dXJl leaked', 'token [token] leaked'],
            ['/auth/reset?token=1a2b3c&x=1', '/auth/reset?token=[redacted]&x=1'],
            ['{"password":"parola123"}', '{"password":"[redacted]"}'],
            ['confirmation 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08 expired', 'confirmation [token] expired'],
        ])('takes the personal part out of %j', (input, expected) => {
            expect(scrub(input)).toBe(expected);
        });

        it.each([
            'Could not erase family 412 at term',
            'at InvoiceService.issue (/srv/itbridge/apps/api/src/modules/invoice/invoice.service.ts:120:15)',
            'Session 2026-10-06T16:00 of group 7 was cancelled',
            'duplicate key value violates unique constraint "UQ_profiles_email_lower"',
            'Request failed with status code 503',
        ])('leaves what a fix starts from: %j', (input) => {
            expect(scrub(input)).toBe(input);
        });
    });

    describe('fingerprint', () => {
        const base = {
            source: ErrorSource.LOGGED,
            origin: 'RetentionJob',
            errorName: 'Error',
            message: 'Could not erase family 12 at term',
            stack: null,
        };

        it('is the same fault whatever family it met', () => {
            expect(fingerprint(base)).toBe(fingerprint({ ...base, message: 'Could not erase family 40 at term' }));
        });

        it('does not change with the line numbers of a new deploy', () => {
            const at = (line: number) =>
                `Error: x\n    at InvoiceService.issue (/srv/api/src/modules/invoice/invoice.service.ts:${line}:15)\n    at next (x.ts:1:1)`;
            expect(fingerprint({ ...base, stack: at(120) })).toBe(fingerprint({ ...base, stack: at(212) }));
        });

        it.each([
            ['another place', { origin: 'ArrearsJob' }],
            ['another kind of error', { errorName: 'TypeError' }],
            ['another message', { message: 'Could not remove enquiry 12 at term' }],
            ['another source', { source: ErrorSource.REQUEST }],
            ['another throw site', { stack: 'Error: x\n    at Other.place (/srv/api/src/other.ts:1:1)' }],
        ])('is another fault in %s', (_label, change) => {
            expect(fingerprint({ ...base, ...change })).not.toBe(fingerprint(base));
        });

        it('fits the column', () => {
            expect(fingerprint(base)).toMatch(/^[a-f0-9]{64}$/);
        });
    });

    it('folds ids, numbers and quoted values out of a message', () => {
        expect(normaliseMessage('Invoice 412 for "2026-10" failed after 3 tries  (id 5f0c7a4e-2d3b-4c1a-9f8e-7a6b5c4d3e2f)')).toBe(
            'Invoice # for <value> failed after # tries (id <uuid>)',
        );
    });

    it('reads where an error was thrown from the first frame of its stack', () => {
        expect(throwSite('TypeError: x\n    at Proxy.render (https://stage.example/_nuxt/Bx3k.js:1:2345)\n    at other (y.js:2:3)')).toBe(
            'at Proxy.render https://stage.example/_nuxt/Bx3k.js',
        );
        expect(throwSite(null)).toBe('');
        expect(throwSite('Error: no frames here')).toBe('');
    });

    describe('routeOf', () => {
        it('names the route Express matched, not the address', () => {
            expect(routeOf({ method: 'GET', route: { path: '/profiles/:id' }, baseUrl: '', path: '/profiles/12', url: '/profiles/12?email=a@b.ro' })).toBe(
                'GET /profiles/:id',
            );
        });

        /**
         * No handler matched: whatever broke is in front of every route, and the path is whatever the
         * caller typed. One origin, not one row per invented path (review of 27 September 2026).
         */
        it('gives every request that matched no route one origin', () => {
            expect(routeOf({ method: 'POST', path: '/invoices/12/fiscal/confirm', url: '/invoices/12/fiscal/confirm' })).toBe('POST (nicio rută)');
            expect(routeOf({ method: 'POST', path: '/x7f3', url: '/x7f3' })).toBe('POST (nicio rută)');
        });
    });

    it('keeps an address the way a log line does', () => {
        expect(occurrencePath('/profiles?email=ana@example.com&page=2')).toBe('/profiles?email=[redacted]&page=2');
        expect(occurrencePath(null)).toBeNull();
    });

    it('keeps the newest twenty occurrences, newest first', () => {
        const occurrence = (n: number) => ({ at: `2026-09-27T10:${String(n).padStart(2, '0')}:00.000Z`, ref: String(n), userId: null, path: null });
        const recent = Array.from({ length: 20 }, (_, i) => occurrence(19 - i));

        const next = withOccurrence(recent, occurrence(20));

        expect(next).toHaveLength(20);
        expect(next[0].ref).toBe('20');
        expect(next[19].ref).toBe('1');
    });

    describe('parseLogCall', () => {
        it('reads a message and its context, the way `new Logger(context).error(message)` forwards it', () => {
            expect(parseLogCall('Could not erase family 12', [undefined, 'Retention'])).toEqual({
                context: 'Retention',
                errorName: 'Error',
                message: 'Could not erase family 12',
                stack: null,
            });
        });

        it('reads the stack passed beside the message', () => {
            const stack = 'Error: boom\n    at Job.run (/srv/api/src/job.ts:3:9)';
            expect(parseLogCall('Tick failed', [stack, 'FiscalIssuingJob'])).toMatchObject({ context: 'FiscalIssuingJob', message: 'Tick failed', stack });
        });

        it('reads the error the scheduler hands over when a job throws', () => {
            const error = new TypeError('Cannot read properties of undefined');
            expect(parseLogCall(error, [undefined, 'Scheduler'])).toEqual({
                context: 'Scheduler',
                errorName: 'TypeError',
                message: 'Cannot read properties of undefined',
                stack: error.stack,
            });
        });

        it('reads an error passed after the message', () => {
            const error = new RangeError('Invalid time value');
            expect(parseLogCall('Could not render', [error, 'PdfService'])).toMatchObject({
                context: 'PdfService',
                errorName: 'RangeError',
                message: 'Could not render: Invalid time value',
                stack: error.stack,
            });
        });

        it('reads a call with no context', () => {
            expect(parseLogCall({ reason: 'x' }, [])).toEqual({ context: null, errorName: 'Error', message: '{"reason":"x"}', stack: null });
        });
    });
});
