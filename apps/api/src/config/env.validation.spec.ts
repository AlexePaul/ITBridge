import { smartBillProblems } from './env.validation';

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
        const live = { SMARTBILL_MODE: 'live', DB_NAME: 'itbridge_prod', ...credentials };

        expect(smartBillProblems(live)).toHaveLength(1);
        expect(smartBillProblems({ ...live, SMARTBILL_LIVE_DB: 'true' })).toHaveLength(1);
        expect(smartBillProblems({ ...live, SMARTBILL_LIVE_DB: 'itbridge_stage' })).toHaveLength(1);
        expect(smartBillProblems({ ...live, SMARTBILL_LIVE_DB: 'itbridge_prod' })).toEqual([]);
    });

    it('takes a VAT rate only as a name and a percentage together', () => {
        expect(smartBillProblems({ SMARTBILL_TAX_NAME: 'Normala' })).toHaveLength(1);
        // Unnamed, SmartBill picks "Taxare inversa" for a 0% rate, whatever the right regime is.
        expect(smartBillProblems({ SMARTBILL_TAX_PERCENTAGE: '0' })).toHaveLength(1);
        expect(smartBillProblems({ SMARTBILL_TAX_NAME: 'Normala', SMARTBILL_TAX_PERCENTAGE: '121' })).toHaveLength(1);
        expect(smartBillProblems({ SMARTBILL_TAX_NAME: 'SFDD', SMARTBILL_TAX_PERCENTAGE: '0' })).toEqual([]);
    });
});
