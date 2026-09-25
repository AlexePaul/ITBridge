import { mayIssueFiscalDocuments, smartBillConfig, type SmartBillConfig } from './smartbill.config';
import {
    classifyFailure,
    describeDiscount,
    describeFailure,
    invoicePayload,
    isLockout,
    isSuccess,
    nextExpectedAfter,
    readIssuedDocument,
    reconcile,
    sanitizeErrorText,
    type FiscalInvoiceInput,
} from './smartbill.rules';

/**
 * The half of E16/S2 that can be decided without a network. Every expectation about SmartBill's
 * behaviour here is quoted from the OpenAPI spec they publish, or from what a client library that
 * runs against the live API records — never guessed: a wrong guess about a fiscal API is a wrong
 * invoice, not a failing test.
 */
describe('SmartBill rules', () => {
    const config: SmartBillConfig = {
        ...smartBillConfig({}),
        mode: 'live',
        username: 'office@example.com',
        token: 'token',
        cif: 'RO12345678',
        invoiceSeries: 'ITB',
    };

    const input: FiscalInvoiceInput = {
        invoiceId: 412,
        amount: 175,
        issueDate: '2026-11-01',
        dueDate: '2026-11-15',
        monthIssued: '2026-10',
        client: { name: 'Pop Ana', address: 'Str. Exemplu 1, București' },
        discounts: [],
    };

    describe('sanitizeErrorText', () => {
        // "Nu afisa errorText ca text simplu, dar nu-l randa nici ca HTML fara sa-l cureti."
        it('keeps the name inside a <b> and drops the help after a <br/>', () => {
            expect(sanitizeErrorText('Cota tva a produsului <b>Servicii</b> nu a fost gasita pe server!<br/>Verifica cotele.')).toBe(
                'Cota tva a produsului Servicii nu a fost gasita pe server!',
            );
        });

        it('drops the hidden help block', () => {
            expect(
                sanitizeErrorText(
                    'Unitatea de masura buc nu are factor de conversie setat.<div id="moreErrorDetails" style="display:none"><p>ajutor</p></div>',
                ),
            ).toBe('Unitatea de masura buc nu are factor de conversie setat.');
        });

        it('says nothing for an HTML page, which is not a sentence', () => {
            expect(sanitizeErrorText('<html><head><title>502 Bad Gateway</title></head></html>')).toBe('');
        });
    });

    describe('what a response means', () => {
        it('takes a 2xx with an empty errorText as success, and one with a cause as a refusal', () => {
            // "campul errorText este sursa de adevar... daca e gol apelul a reusit".
            expect(isSuccess(200, { errorText: '', number: '0041' })).toBe(true);
            expect(isSuccess(200, { errorText: 'Seria nu a fost gasita!' })).toBe(false);
            expect(classifyFailure(200, { errorText: 'Seria nu a fost gasita!' })).toBe('refused');
        });

        it('recognises the lock-out as it is observed, a 403 naming the limit, as well as the documented 429', () => {
            const observed = { errorText: 'Ai depasit limita maxima de requesturi admisa. Vei putea executa alte requesturi dupa 10 min' };
            expect(isLockout(403, observed)).toBe(true);
            expect(classifyFailure(403, observed)).toBe('throttled');
            expect(classifyFailure(429, {})).toBe('throttled');
        });

        it('reads a 403 that is not the limit as a problem of rights, which a pause would not fix', () => {
            expect(classifyFailure(403, { errorText: 'Nu aveti dreptul de a adauga facturi pe seria selectata' })).toBe('configuration');
            expect(classifyFailure(401, { errorText: 'Autentificare esuata.' })).toBe('configuration');
        });

        // The one kind that may have become an invoice nobody saw — so it is never "refused".
        it('leaves silence and server errors open', () => {
            expect(classifyFailure(null, null)).toBe('ambiguous');
            expect(classifyFailure(500, { errorText: 'Internal Server Error!' })).toBe('ambiguous');
            expect(classifyFailure(502, null)).toBe('ambiguous');
        });

        it('treats the rest of the 4xx as a refusal', () => {
            for (const status of [400, 404, 405, 406, 410, 415, 422]) {
                expect(classifyFailure(status, {})).toBe('refused');
            }
        });

        it('names the offending field of an invalid_request_error, which has no errorText', () => {
            const body = {
                status: 400,
                type: 'invalid_request_error',
                errors: [{ code: 'json_mapping_error', message: 'Unrecognized property: zzz.', param: 'zzz' }],
            };
            expect(describeFailure(400, body)).toBe('Unrecognized property: zzz. (zzz)');
        });

        it('reads the documented success envelope, and a failed one as nothing', () => {
            expect(
                readIssuedDocument({
                    errorText: '',
                    number: '0041',
                    series: 'ITB',
                    documentId: 20363,
                    documentUrl: 'https://cloud.smartbill.ro/documente/editare/factura/20363/',
                    documentViewUrl: 'https://cloud.smartbill.ro/documente/extern/pf/factura/abc?srvid=2',
                }),
            ).toEqual({
                series: 'ITB',
                number: '0041',
                documentId: 20363,
                documentUrl: 'https://cloud.smartbill.ro/documente/editare/factura/20363/',
                documentViewUrl: 'https://cloud.smartbill.ro/documente/extern/pf/factura/abc?srvid=2',
            });
            expect(readIssuedDocument({ errorText: 'x', number: '', series: '', documentId: -1 })).toEqual({
                series: null,
                number: null,
                documentId: null,
                documentUrl: null,
                documentViewUrl: null,
            });
        });
    });

    describe('invoicePayload', () => {
        it('is one line at the amount the platform computed, so the two agree to the leu', () => {
            const payload = invoicePayload(input, config, false);

            expect(payload.products).toHaveLength(1);
            expect(payload.products[0]).toMatchObject({ quantity: 1, price: 175, currency: 'RON', isService: true, saveToDb: false });
            expect(payload.products[0].name).toBe('Servicii educaționale — octombrie 2026');
            expect(payload).toMatchObject({ companyVatCode: 'RO12345678', seriesName: 'ITB', isDraft: false, issueDate: '2026-11-01', dueDate: '2026-11-15' });
        });

        it('sends the name and the address, and nothing else about the family', () => {
            const payload = invoicePayload(input, config, false);

            expect(payload.client).toEqual({ name: 'Pop Ana', country: 'Romania', address: 'Str. Exemplu 1, București', isTaxPayer: false, saveToDb: false });
        });

        it('never asks SmartBill to e-mail the family — the platform does, through the outbox', () => {
            expect(invoicePayload(input, config, false).sendEmail).toBe(false);
        });

        it('carries no VAT fields for a school that is not a VAT payer', () => {
            const product = invoicePayload(input, { ...config, tax: null }, false).products[0];

            expect(product).not.toHaveProperty('taxName');
            expect(product).not.toHaveProperty('taxPercentage');
            expect(product).not.toHaveProperty('isTaxIncluded');
        });

        // Prices here are what a family pays. Sent without `isTaxIncluded`, SmartBill would read
        // 175 as a base and print 211,75 — "preturile produselor in V1 sunt implicit FARA TVA".
        it('sends a configured VAT rate with the price as VAT-inclusive', () => {
            const product = invoicePayload(input, { ...config, tax: { name: 'Normala', percentage: 21 } }, false).products[0];

            expect(product).toMatchObject({ isTaxIncluded: true, taxName: 'Normala', taxPercentage: 21 });
        });

        it('adds the product code only for an account that requires one', () => {
            expect(invoicePayload(input, config, false).products[0]).not.toHaveProperty('code');
            expect(invoicePayload(input, { ...config, productCode: 'CURS' }, false).products[0].code).toBe('CURS');
        });

        it('leaves the address out rather than sending an empty one', () => {
            expect(invoicePayload({ ...input, client: { name: 'Pop Ana', address: null } }, config, false).client).not.toHaveProperty('address');
        });

        it('is a draft only when asked', () => {
            expect(invoicePayload(input, config, true).isDraft).toBe(true);
        });

        it('explains the discounts in the mentions, by the rule rather than a recomputed sum', () => {
            const payload = invoicePayload(
                {
                    ...input,
                    discounts: [
                        { name: 'Recomandare', type: 'percent', value: 50 },
                        { name: 'Bunăvoință', type: 'fixed', value: 25 },
                    ],
                },
                config,
                false,
            );

            expect(payload.mentions).toBe('Nr. intern ITBridge: 412. Include reducerea „Recomandare”: −50%. Include reducerea „Bunăvoință”: −25 lei.');
        });

        it('writes a fractional percentage the Romanian way', () => {
            expect(describeDiscount({ name: 'Frate', type: 'percent', value: 12.5 })).toBe('Include reducerea „Frate”: −12,5%.');
        });
    });

    describe('reconcile', () => {
        it('sends again a request that was never sent — the number is written before the call', () => {
            expect(reconcile(null, 42)).toEqual({ outcome: 'not_sent' });
        });

        it('sends again when the series did not move: it cannot hold the invoice', () => {
            expect(reconcile(41, 41)).toEqual({ outcome: 'not_created' });
        });

        // "Almost certainly ours" is not the bar for a fiscal record: a person confirms.
        it('hands a series that moved by one to a person, with the probable number', () => {
            expect(reconcile(41, 42)).toMatchObject({ outcome: 'needs_review', probableNumber: 41 });
        });

        it('does not guess a number when the series moved further', () => {
            expect(reconcile(41, 43)).toMatchObject({ outcome: 'needs_review', probableNumber: null });
        });
    });

    describe('nextExpectedAfter', () => {
        it('re-anchors on the number SmartBill just gave, padding and all', () => {
            expect(nextExpectedAfter('0041')).toBe(42);
        });

        it('gives up on a number it cannot read, so the series is read afresh', () => {
            expect(nextExpectedAfter(null)).toBeNull();
            expect(nextExpectedAfter('A-1')).toBeNull();
        });
    });
});

describe('smartBillConfig', () => {
    it('is off unless told otherwise, and off for anything it does not recognise', () => {
        expect(smartBillConfig({}).mode).toBe('off');
        expect(smartBillConfig({ SMARTBILL_MODE: 'LIVE' }).mode).toBe('off');
        expect(smartBillConfig({ SMARTBILL_MODE: 'draft' }).mode).toBe('draft');
    });

    it('defaults to the production V1 host and the unit every account starts with', () => {
        const config = smartBillConfig({});
        expect(config.baseUrl).toBe('https://ws.smartbill.ro/SBORO/api');
        expect(config.measuringUnit).toBe('buc');
    });

    it('reads a VAT rate only as a pair', () => {
        expect(smartBillConfig({ SMARTBILL_TAX_NAME: 'Normala', SMARTBILL_TAX_PERCENTAGE: '21' }).tax).toEqual({ name: 'Normala', percentage: 21 });
        expect(smartBillConfig({ SMARTBILL_TAX_NAME: 'Normala' }).tax).toBeNull();
    });
});

// SmartBill has no sandbox, so stage cannot have one either: the most it may send is a draft.
describe('mayIssueFiscalDocuments', () => {
    it('lets a production backend issue', () => {
        expect(mayIssueFiscalDocuments({ NODE_ENV: 'production' })).toBe(true);
    });

    it('keeps stage and a laptop to drafts', () => {
        expect(mayIssueFiscalDocuments({ NODE_ENV: 'stage' })).toBe(false);
        expect(mayIssueFiscalDocuments({ NODE_ENV: 'development' })).toBe(false);
    });

    // Production is declared, never inferred — an unset environment is a laptop.
    it('reads an unset or misspelt environment as not production', () => {
        expect(mayIssueFiscalDocuments({})).toBe(false);
        expect(mayIssueFiscalDocuments({ NODE_ENV: '' })).toBe(false);
        expect(mayIssueFiscalDocuments({ NODE_ENV: 'Production' })).toBe(false);
        expect(mayIssueFiscalDocuments({ NODE_ENV: 'prod' })).toBe(false);
    });

    // Under jest the production host is refused outright, so `live` only ever reaches a fake.
    it('lets the suites exercise live against their fake', () => {
        expect(mayIssueFiscalDocuments({ NODE_ENV: 'test' })).toBe(true);
    });
});
