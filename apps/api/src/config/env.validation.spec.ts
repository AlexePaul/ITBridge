import { smartBillProblems, validateEnv } from './env.validation';

/**
 * The SmartBill half of the boot-time check — E16/S2. SmartBill has no sandbox, so a wrong mode is
 * a real invoice: these are the settings that refuse to start rather than issue something.
 */
describe('smartBillProblems', () => {
    const credentials = {
        SMARTBILL_USERNAME: 'office@example.com',
        SMARTBILL_TOKEN: 'token',
        SMARTBILL_CIF: 'RO12345678',
        SMARTBILL_INVOICE_SERIES: 'ITB',
    };
    /** What `live` needs beyond the credentials `draft` needs: a series to number cash receipts on. */
    const liveOnly = { SMARTBILL_RECEIPT_SERIES: 'CH' };

    it('asks nothing of a backend that sends nothing', () => {
        expect(smartBillProblems({})).toEqual([]);
        expect(smartBillProblems({ SMARTBILL_MODE: 'off' })).toEqual([]);
    });

    it('refuses a mode that sends without the credentials to send with', () => {
        expect(smartBillProblems({ SMARTBILL_MODE: 'draft' })).toEqual([
            'SMARTBILL_MODE=draft needs SMARTBILL_USERNAME, SMARTBILL_TOKEN, SMARTBILL_CIF, SMARTBILL_INVOICE_SERIES',
        ]);
        expect(smartBillProblems({ SMARTBILL_MODE: 'draft', ...credentials })).toEqual([]);
    });

    // The rule `SEED_ALLOW_NON_LOCAL` follows: a bare "yes" authorises whatever database it is
    // copied next to, and stage's database is seed data whose families would each get an invoice.
    it('refuses live unless SMARTBILL_LIVE_DB names this very database', () => {
        const live = { SMARTBILL_MODE: 'live', NODE_ENV: 'production', DB_NAME: 'itbridge_prod', ...credentials, ...liveOnly };

        expect(smartBillProblems(live)).toHaveLength(1);
        expect(smartBillProblems({ ...live, SMARTBILL_LIVE_DB: 'true' })).toHaveLength(1);
        expect(smartBillProblems({ ...live, SMARTBILL_LIVE_DB: 'itbridge_stage' })).toHaveLength(1);
        expect(smartBillProblems({ ...live, SMARTBILL_LIVE_DB: 'itbridge_prod' })).toEqual([]);
    });

    // The check above passes a stage file that says `live` and names stage's own database — two
    // SmartBill settings typed on the same afternoon. The backend has to be production as well.
    it('refuses live anywhere but a production backend', () => {
        const live = { SMARTBILL_MODE: 'live', DB_NAME: 'itbridge_stage', SMARTBILL_LIVE_DB: 'itbridge_stage', ...credentials, ...liveOnly };

        for (const nodeEnv of ['stage', 'development', undefined]) {
            const problems = smartBillProblems({ ...live, NODE_ENV: nodeEnv });
            expect(problems).toHaveLength(1);
            expect(problems[0]).toContain('only a production backend');
        }
        expect(smartBillProblems({ ...live, NODE_ENV: 'production' })).toEqual([]);
    });

    // E16/S5: a cash payment is recorded as a numbered receipt, so `live` without a series for them
    // would issue invoices and then leave every cash payment waiting on a setting.
    it('refuses live without a receipt series, and asks nothing of the sort in draft', () => {
        const live = { SMARTBILL_MODE: 'live', NODE_ENV: 'production', DB_NAME: 'itbridge_prod', SMARTBILL_LIVE_DB: 'itbridge_prod', ...credentials };

        expect(smartBillProblems(live)).toEqual([expect.stringContaining('SMARTBILL_RECEIPT_SERIES')]);
        expect(smartBillProblems({ ...live, ...liveOnly })).toEqual([]);
        expect(smartBillProblems({ SMARTBILL_MODE: 'draft', ...credentials })).toEqual([]);
    });

    it('lets stage send drafts', () => {
        expect(smartBillProblems({ SMARTBILL_MODE: 'draft', NODE_ENV: 'stage', ...credentials })).toEqual([]);
    });

    it('takes a VAT rate only as a name and a percentage together', () => {
        expect(smartBillProblems({ SMARTBILL_TAX_NAME: 'Normala' })).toHaveLength(1);
        // Unnamed, SmartBill picks "Taxare inversa" for a 0% rate, whatever the right regime is.
        expect(smartBillProblems({ SMARTBILL_TAX_PERCENTAGE: '0' })).toHaveLength(1);
        expect(smartBillProblems({ SMARTBILL_TAX_NAME: 'Normala', SMARTBILL_TAX_PERCENTAGE: '121' })).toHaveLength(1);
        expect(smartBillProblems({ SMARTBILL_TAX_NAME: 'SFDD', SMARTBILL_TAX_PERCENTAGE: '0' })).toEqual([]);
    });
});

describe('validateEnv', () => {
    const minimal = {
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_USER: 'itbridge',
        DB_PASSWORD: 'itbridge',
        DB_NAME: 'itbridge',
        JWT_ACCESS_TOKEN_SECRET: 'access-secret-for-the-spec',
        JWT_REFRESH_TOKEN_SECRET: 'refresh-secret-for-the-spec',
        AWS_REGION: 'eu-north-1',
    };

    // The value stage runs as — the one setting that tells it apart from production.
    it('boots a backend that says it is stage', () => {
        expect(() => validateEnv({ ...minimal, NODE_ENV: 'stage' })).not.toThrow();
    });

    // One spelling: a second one would be a stage that nothing recognises as stage.
    it('refuses a spelling it does not know', () => {
        expect(() => validateEnv({ ...minimal, NODE_ENV: 'staging' })).toThrow(/NODE_ENV/);
    });
});
