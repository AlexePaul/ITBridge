import { SmartBillService } from './smartbill.service';
import { SmartBillError } from './smartbill.rules';

/**
 * `SmartBillService` has one dependency — SmartBill, over `fetch` — so the double is `fetch`, as in
 * `mail.service.spec.ts`. What is worth asserting is what a caller cannot see: the exact request,
 * and which kind of failure an answer becomes, since the kind decides whether an invoice may be
 * sent again.
 */
describe('SmartBillService', () => {
    let service: SmartBillService;
    let fetchMock: jest.Mock;

    function respond(status: number, body: unknown): Response {
        return {
            ok: status >= 200 && status < 300,
            status,
            json: () => (body === undefined ? Promise.reject(new Error('no body')) : Promise.resolve(body)),
            arrayBuffer: () => Promise.resolve(new TextEncoder().encode(typeof body === 'string' ? body : '').buffer),
        } as unknown as Response;
    }

    const settings = {
        SMARTBILL_MODE: 'live',
        SMARTBILL_BASE_URL: 'http://smartbill.test/SBORO/api',
        SMARTBILL_USERNAME: 'office@example.com',
        SMARTBILL_TOKEN: 'secret-token',
        SMARTBILL_CIF: 'RO12345678',
        SMARTBILL_INVOICE_SERIES: 'ITB',
    };

    beforeEach(() => {
        Object.assign(process.env, settings);
        fetchMock = jest.fn();
        global.fetch = fetchMock;
        service = new SmartBillService();
    });

    afterEach(() => {
        for (const key of Object.keys(settings)) delete process.env[key];
    });

    it('authenticates with the e-mail and the token, as Basic auth', async () => {
        fetchMock.mockResolvedValue(respond(200, { errorText: '', taxes: [{ name: 'Normala', percentage: 21 }] }));

        await expect(service.taxes()).resolves.toEqual([{ name: 'Normala', percentage: 21 }]);

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('http://smartbill.test/SBORO/api/tax?cif=RO12345678');
        expect(init.headers.authorization).toBe(`Basic ${Buffer.from('office@example.com:secret-token').toString('base64')}`);
    });

    it("reads the platform's series and its next number, and fails early on a series the account lacks", async () => {
        fetchMock.mockResolvedValue(respond(200, { errorText: '', list: [{ name: 'ITB', nextNumber: 41, type: 'f' }] }));
        await expect(service.nextInvoiceNumber()).resolves.toBe(41);

        fetchMock.mockResolvedValue(respond(200, { errorText: '', list: [{ name: 'FCT', nextNumber: 900, type: 'f' }] }));
        await expect(service.nextInvoiceNumber()).rejects.toMatchObject({ kind: 'configuration' });
    });

    it('posts the invoice to /invoice/v2 as JSON and reads back the document', async () => {
        fetchMock.mockResolvedValue(respond(200, { errorText: '', number: '0041', series: 'ITB', documentId: 7, documentUrl: 'u', documentViewUrl: 'v' }));

        const document = await service.issueInvoice({ companyVatCode: 'RO12345678' } as never);

        expect(document).toEqual({ series: 'ITB', number: '0041', documentId: 7, documentUrl: 'u', documentViewUrl: 'v' });
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('http://smartbill.test/SBORO/api/invoice/v2');
        expect(init.method).toBe('POST');
        expect(init.headers['content-type']).toBe('application/json');
    });

    it('turns a refusal into a readable sentence', async () => {
        fetchMock.mockResolvedValue(respond(400, { errorText: 'Seria nu a fost gasita! Folositi o serie creata in contul de cloud.', documentId: -1 }));

        await expect(service.issueInvoice({} as never)).rejects.toEqual(
            new SmartBillError('refused', 'Seria nu a fost gasita! Folositi o serie creata in contul de cloud.', 400),
        );
    });

    it('treats a dropped connection as an open question, never as a refusal', async () => {
        fetchMock.mockRejectedValue(new TypeError('fetch failed'));

        await expect(service.issueInvoice({} as never)).rejects.toMatchObject({ kind: 'ambiguous' });
    });

    // Every call during the ten minutes would be refused, and on V3 the penalty grows with each one.
    it('stops calling SmartBill at all after a lock-out', async () => {
        fetchMock.mockResolvedValue(respond(403, { errorText: 'Ai depasit limita maxima de requesturi admisa.' }));

        await expect(service.taxes()).rejects.toMatchObject({ kind: 'throttled' });
        expect(service.lockedOutUntil()).not.toBeNull();

        await expect(service.series('f')).rejects.toMatchObject({ kind: 'throttled' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('asks for the PDF as octet-stream — application/pdf is the one Accept that answers 406', async () => {
        fetchMock.mockResolvedValue(respond(200, '%PDF-1.4'));

        const pdf = await service.invoicePdf('ITB', '0041');

        expect(pdf.toString()).toBe('%PDF-1.4');
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('http://smartbill.test/SBORO/api/invoice/pdf?cif=RO12345678&seriesname=ITB&number=0041');
        expect(init.headers.accept).toBe('application/octet-stream');
    });

    it('sends nothing without its credentials', async () => {
        delete process.env.SMARTBILL_TOKEN;

        await expect(service.taxes()).rejects.toMatchObject({ kind: 'configuration' });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    describe('payments — E16/S5', () => {
        it('reads what SmartBill counts as collected on an invoice', async () => {
            fetchMock.mockResolvedValue(respond(200, { errorText: '', invoiceTotalAmount: 350, paidAmount: 200, unpaidAmount: 150, paid: false }));

            await expect(service.invoicePaymentStatus('ITB', '0041')).resolves.toEqual({ total: 350, paid: 200, unpaid: 150, isPaid: false });
            expect(fetchMock.mock.calls[0][0]).toBe('http://smartbill.test/SBORO/api/invoice/paymentstatus?cif=RO12345678&seriesname=ITB&number=0041');
        });

        // A missing figure read as zero would make every lost answer look like nothing happened.
        it('treats an answer without the paid amount as unanswered, never as zero', async () => {
            fetchMock.mockResolvedValue(respond(200, { errorText: '', invoiceTotalAmount: 350 }));

            await expect(service.invoicePaymentStatus('ITB', '0041')).rejects.toMatchObject({ kind: 'ambiguous' });
        });

        it('posts a collection to /payment and keeps the receipt number it answers with', async () => {
            fetchMock.mockResolvedValue(respond(200, { errorText: '', message: '', number: '0007', series: 'CH', url: '' }));

            await expect(service.recordPayment({ type: 'Chitanta' } as never)).resolves.toEqual({ series: 'CH', number: '0007' });
            const [url, init] = fetchMock.mock.calls[0];
            expect(url).toBe('http://smartbill.test/SBORO/api/payment');
            expect(init.method).toBe('POST');
        });

        it("reads the receipt series' next number, and fails early without one", async () => {
            process.env.SMARTBILL_RECEIPT_SERIES = 'CH';
            fetchMock.mockResolvedValue(respond(200, { errorText: '', list: [{ name: 'CH', nextNumber: 7, type: 'c' }] }));
            await expect(service.nextReceiptNumber()).resolves.toBe(7);

            delete process.env.SMARTBILL_RECEIPT_SERIES;
            await expect(service.nextReceiptNumber()).rejects.toMatchObject({ kind: 'configuration' });
        });
    });

    // The door every request passes: a stage backend issues nothing fiscal, whatever the mode says.
    describe('outside production', () => {
        beforeEach(() => {
            jest.replaceProperty(process.env, 'NODE_ENV', 'stage');
        });

        afterEach(() => {
            jest.restoreAllMocks();
        });

        it('refuses anything but a draft, before a request leaves', async () => {
            await expect(service.issueInvoice({ isDraft: false } as never)).rejects.toMatchObject({ kind: 'configuration' });
            await expect(service.issueInvoice({} as never)).rejects.toMatchObject({ kind: 'configuration' });
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('records no collection either — it is a line in the school accounts', async () => {
            await expect(service.recordPayment({ type: 'Ordin plata' } as never)).rejects.toMatchObject({ kind: 'configuration' });
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('still sends a draft', async () => {
            fetchMock.mockResolvedValue(respond(200, { errorText: '', number: '', series: '', documentId: 8, documentUrl: 'u', documentViewUrl: '' }));

            await expect(service.issueInvoice({ isDraft: true } as never)).resolves.toMatchObject({ documentId: 8 });
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });
    });

    // The guard that keeps any test from ever issuing a real fiscal document.
    it('refuses the production host under jest, whatever the mode says', async () => {
        delete process.env.SMARTBILL_BASE_URL;

        await expect(service.taxes()).rejects.toMatchObject({ kind: 'configuration' });
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
