import { InvoiceAnnouncementService, INVOICE_ISSUED_DEDUPE_PREFIX, type AnnouncedInvoice } from './invoice-announcement.service';
import type { MailTemplateService } from 'src/modules/mail/mail-template.service';
import type { OutboxService } from 'src/modules/mail/outbox.service';
import type { DataSource } from 'typeorm';

/**
 * Terms §11.2 and §13: „o vezi în portal și ești anunțat pe email când apare". The template renders
 * what it is given; what is asserted here is what it is given, and where the message goes.
 */
describe('InvoiceAnnouncementService', () => {
    let render: jest.Mock;
    let queueOrRecord: jest.Mock;
    /** The family's account: whether it can sign in, and whether its address is proven. */
    let accountLookup: jest.Mock;
    /** What has been paid on the invoice when the message is written. */
    let paidQuery: jest.Mock;
    let reader: { getRepository: () => { findOne: jest.Mock }; query: jest.Mock };
    let service: InvoiceAnnouncementService;
    let env: NodeJS.ProcessEnv;

    const invoice = (fields: Partial<AnnouncedInvoice> = {}): AnnouncedInvoice => ({
        id: 55,
        amount: 350,
        monthIssued: '2026-10',
        dateIssued: new Date(2026, 10, 2),
        fiscalSeries: null,
        fiscalNumber: null,
        fiscalStatus: null,
        parent: { id: 4, firstName: 'Ana', email: 'ana@example.com' },
        ...fields,
    });

    beforeEach(() => {
        env = { ...process.env };
        delete process.env.SCHOOL_LEGAL_NAME;
        delete process.env.SCHOOL_IBAN;
        render = jest.fn((_key: string, data: Record<string, string>) =>
            Promise.resolve({ subject: 'Factura', bodyText: JSON.stringify(data), bodyHtml: null }),
        );
        queueOrRecord = jest.fn().mockResolvedValue(null);
        accountLookup = jest.fn().mockResolvedValue({ id: 4, user: { id: 9, emailConfirmedAt: new Date(2026, 0, 5), suspendedAt: null } });
        paidQuery = jest.fn().mockResolvedValue([{ paid: '0' }]);
        reader = { getRepository: () => ({ findOne: accountLookup }), query: paidQuery };
        const dataSource = { manager: reader };
        service = new InvoiceAnnouncementService(
            { render } as unknown as MailTemplateService,
            { queueOrRecord } as unknown as OutboxService,
            dataSource as unknown as DataSource,
        );
    });

    afterEach(() => {
        process.env = env;
    });

    it('queues one message per invoice, to the family, in the caller transaction', async () => {
        const findOne = jest.fn().mockResolvedValue({ id: 4, user: null });
        const query = jest.fn().mockResolvedValue([{ paid: '0' }]);
        const manager = { getRepository: () => ({ findOne }), query } as never;

        await service.announce(invoice(), manager);

        expect(render).toHaveBeenCalledWith(
            'invoice-issued',
            expect.objectContaining({ firstName: 'Ana', month: 'octombrie', amount: '350 lei', dueOn: '16 noiembrie' }),
        );
        expect(queueOrRecord).toHaveBeenCalledWith(
            { email: 'ana@example.com', confirmed: true },
            expect.objectContaining({ dedupeKey: `${INVOICE_ISSUED_DEDUPE_PREFIX}55` }),
            manager,
        );
        // The account and the payments are read in the caller's transaction too, not beside it.
        expect(findOne).toHaveBeenCalled();
        expect(query).toHaveBeenCalled();
        expect(accountLookup).not.toHaveBeenCalled();
    });

    /**
     * In `live` the email waits for SmartBill's number, which a refusal or a review can hold for days
     * while the family pays at the office. It then asks for what is left, and a month already
     * settled says nothing more — its receipt said it (review of 27 September 2026).
     */
    it('asks for what is left when money arrived before the number did', async () => {
        paidQuery.mockResolvedValue([{ paid: '200' }]);

        await service.announce(invoice());

        expect(render).toHaveBeenCalledWith('invoice-issued', expect.objectContaining({ amount: '150 lei' }));
    });

    it('says nothing about a month already paid by the time the invoice is numbered', async () => {
        paidQuery.mockResolvedValue([{ paid: '350' }]);

        await service.announce(invoice());

        expect(queueOrRecord).not.toHaveBeenCalled();
    });

    /** E11/S2: an amount and an account number do not go to an address the family has not proven. */
    it('holds the message for an address the account has not proven since it changed', async () => {
        accountLookup.mockResolvedValue({ id: 4, user: { id: 9, emailConfirmedAt: null, suspendedAt: null } });

        await service.announce(invoice());

        expect(queueOrRecord).toHaveBeenCalledWith({ email: 'ana@example.com', confirmed: false }, expect.anything(), undefined);
    });

    /** Terms §14: a suspended family still hears about its invoice, but not with a link to a login it cannot pass. */
    it('sends a suspended family to the contact page', async () => {
        accountLookup.mockResolvedValue({ id: 4, user: { id: 9, emailConfirmedAt: new Date(2026, 0, 5), suspendedAt: new Date(2026, 8, 1) } });

        await service.announce(invoice());

        expect((render.mock.calls[0][1] as Record<string, string>).portalUrl).toMatch(/\/contact$/);
    });

    it('sends a family with an account to the payments page of the portal', async () => {
        await service.announce(invoice());

        const data = render.mock.calls[0][1] as Record<string, string>;
        expect(data.portalUrl).toMatch(/\/user\/payments$/);
        expect(data.portalNote).toContain('din portal');
    });

    /**
     * A family the office typed in has no account, so a link to the portal is a login form it cannot
     * pass. It is told to ask for the PDF, and given the contact page (QA of 27 September 2026).
     */
    it('sends a family with no account to the contact page, never to a login it cannot pass', async () => {
        accountLookup.mockResolvedValue({ id: 4, user: null });

        await service.announce(invoice());

        const data = render.mock.calls[0][1] as Record<string, string>;
        expect(data.portalUrl).toMatch(/\/contact$/);
        expect(data.portalNote).toContain('scrie-ne');
        expect(data.portalNote).not.toContain('portal');
    });

    /** A zero-lei month is a row for the school's records; in an inbox it reads like a mistake. */
    it('says nothing about a month with nothing to pay', async () => {
        await service.announce(invoice({ amount: 0 }));

        expect(queueOrRecord).not.toHaveBeenCalled();
    });

    it('names the fiscal number as the reference when SmartBill gave one, and the platform number otherwise', async () => {
        process.env.SCHOOL_LEGAL_NAME = 'IT Bridge School SRL';
        process.env.SCHOOL_IBAN = 'RO49AAAA1B31007593840000';

        await service.announce(invoice({ fiscalSeries: 'ITB', fiscalNumber: '0042' }));
        await service.announce(invoice());

        const [fiscal, platform] = render.mock.calls.map(([, data]) => (data as Record<string, string>).paymentInstructions);
        expect(fiscal).toContain('RO49 AAAA 1B31 0075 9384 0000');
        expect(fiscal).toContain('scrie factura ITB 0042');
        expect(platform).toContain('scrie factura nr. 55');
    });

    /** No account configured: never a placeholder IBAN, which a family might send money to. */
    it('sends the family to the office for the account when none is configured', async () => {
        await service.announce(invoice());

        expect((render.mock.calls[0][1] as Record<string, string>).paymentInstructions).toContain('ni le ceri la birou');
    });

    /** A family with no address leaves an `undeliverable` row, which is `queueOrRecord`'s job — E17/S5. */
    it('hands an absent address to the outbox rather than skipping', async () => {
        await service.announce(invoice({ parent: { firstName: 'Ana', email: null } as never }));

        expect(queueOrRecord).toHaveBeenCalledWith({ email: null, confirmed: true }, expect.anything(), undefined);
    });
});
