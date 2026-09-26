import { corsOrigins, swaggerEnabled } from './bootstrap-options';

describe('bootstrap options', () => {
    describe('corsOrigins', () => {
        it('takes the list it is given, trimmed', () => {
            expect(corsOrigins({ CORS_ORIGINS: ' https://stage.itbridgeschool.com , http://127.0.0.1:3124 ' })).toEqual([
                'https://stage.itbridgeschool.com',
                'http://127.0.0.1:3124',
            ]);
        });

        /** A default that answers `localhost` is one nobody meant to ship. */
        it('allows only the site in production when no list is given', () => {
            expect(corsOrigins({ NODE_ENV: 'production' })).toEqual(['https://itbridgeschool.com']);
            expect(corsOrigins({ NODE_ENV: 'production', CORS_ORIGINS: ' , ' })).toEqual(['https://itbridgeschool.com']);
        });

        it('adds the local frontend everywhere else', () => {
            expect(corsOrigins({})).toEqual(['https://itbridgeschool.com', 'http://localhost:3001']);
            expect(corsOrigins({ NODE_ENV: 'stage' })).toContain('http://localhost:3001');
        });
    });

    describe('swaggerEnabled', () => {
        it('is off in production and on everywhere else', () => {
            expect(swaggerEnabled({ NODE_ENV: 'production' })).toBe(false);
            expect(swaggerEnabled({ NODE_ENV: 'stage' })).toBe(true);
            expect(swaggerEnabled({})).toBe(true);
        });

        it('does what SWAGGER_ENABLED says when it says something', () => {
            expect(swaggerEnabled({ NODE_ENV: 'production', SWAGGER_ENABLED: 'true' })).toBe(true);
            expect(swaggerEnabled({ NODE_ENV: 'stage', SWAGGER_ENABLED: 'false' })).toBe(false);
        });
    });
});
