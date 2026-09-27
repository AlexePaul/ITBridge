import { configurationNotes, type ConfigurationFacts } from './system-status.rules';

/** A backend with nothing to say: production, every setting in place. */
const healthy = (fields: Partial<ConfigurationFacts> = {}): ConfigurationFacts => ({
    environment: 'production',
    siteUrlConfigured: true,
    siteUrl: 'https://itbridgeschool.com',
    mailSending: true,
    mailProviderConfigured: true,
    transferDetails: true,
    storageReachable: true,
    pendingMigrations: 0,
    smartBillMode: 'live',
    ...fields,
});

const codes = (facts: ConfigurationFacts) => configurationNotes(facts).map((note) => `${note.level}:${note.code}`);

describe('configurationNotes', () => {
    it('says only which SmartBill mode is on, when nothing is wrong', () => {
        expect(codes(healthy())).toEqual(['notice:SMARTBILL_LIVE']);
    });

    /**
     * Stage on 27 September 2026: labelled production, sending nothing, with no SITE_URL. The second
     * half is the one that would have been found in an inbox — a confirmation link to the public site.
     */
    it('names both halves of stage as it ran on 27 September', () => {
        expect(
            codes(healthy({ environment: 'production', mailSending: false, mailProviderConfigured: false, transferDetails: false, smartBillMode: 'off' })),
        ).toEqual(['problem:PRODUCTION_WITHOUT_MAIL', 'problem:TRANSFER_DETAILS_MISSING', 'notice:SMARTBILL_OFF']);
        expect(codes(healthy({ environment: 'stage', siteUrlConfigured: false, mailSending: false, transferDetails: false, smartBillMode: 'draft' }))).toEqual([
            'problem:SITE_URL_MISSING',
            'notice:MAIL_OFF',
            'notice:TRANSFER_DETAILS_MISSING',
            'notice:SMARTBILL_DRAFT',
        ]);
    });

    it('takes a missing SITE_URL as right in production, where the fallback is the real domain', () => {
        expect(codes(healthy({ siteUrlConfigured: false }))).not.toContain('problem:SITE_URL_MISSING');
    });

    it('flags an address on localhost anywhere but a laptop', () => {
        expect(codes(healthy({ environment: 'stage', siteUrl: 'http://localhost:3001' }))).toContain('problem:SITE_URL_LOCAL');
        expect(codes(healthy({ environment: 'stage', siteUrl: 'http://127.0.0.1:3124/' }))).toContain('problem:SITE_URL_LOCAL');
        expect(codes(healthy({ environment: 'development', siteUrl: 'http://localhost:3001' }))).not.toContain('problem:SITE_URL_LOCAL');
        // A host that merely starts with the word is somebody's real domain.
        expect(codes(healthy({ environment: 'stage', siteUrl: 'https://localhost-school.ro' }))).not.toContain('problem:SITE_URL_LOCAL');
    });

    it('calls a dispatcher with no provider a problem where families are waiting, and a notice on a laptop', () => {
        expect(codes(healthy({ mailProviderConfigured: false }))).toContain('problem:MAIL_KEY_MISSING');
        expect(codes(healthy({ environment: 'development', siteUrl: 'http://localhost:3001', mailProviderConfigured: false }))).toContain(
            'notice:MAIL_KEY_MISSING',
        );
        // With the dispatcher off, a missing key is a decision, not an omission.
        expect(codes(healthy({ environment: 'stage', mailSending: false, mailProviderConfigured: false }))).not.toContain('problem:MAIL_KEY_MISSING');
    });

    it('reports storage it cannot reach and migrations that have not run', () => {
        expect(codes(healthy({ storageReachable: false, pendingMigrations: 2 }))).toEqual([
            'problem:STORAGE_UNREACHABLE',
            'problem:MIGRATIONS_PENDING',
            'notice:SMARTBILL_LIVE',
        ]);
    });

    it('lists every problem before any notice', () => {
        const levels = configurationNotes(
            healthy({ environment: 'stage', siteUrlConfigured: false, mailSending: false, storageReachable: false, transferDetails: false }),
        ).map((note) => note.level);
        expect(levels).toEqual([...levels].sort((a, b) => (a === b ? 0 : a === 'problem' ? -1 : 1)));
    });
});
