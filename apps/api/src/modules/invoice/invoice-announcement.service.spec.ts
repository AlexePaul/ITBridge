import { InvoiceAnnouncementService, INVOICE_ISSUED_DEDUPE_PREFIX, type AnnouncedInvoice } from './invoice-announcement.service';
import type { MailTemplateService } from 'src/modules/mail/mail-template.service';
import type { OutboxService } from 'src/modules/mail/outbox.service';

/**
 * Terms §11.2 and §13: „o vezi în portal și ești anunțat pe email când apare". The template renders
 * what it is given; what is asserted here is what it is given, and where the message goes.
 */
describe('InvoiceAnnouncementService', () => {
    let render: jest.Mock;
    let queueOrRecord: jest.Mock;
    let service: InvoiceAnnouncementService;
    let env: NodeJS.ProcessEnv;

    const invoice = (fields: Partial<AnnouncedInvoice> = {}): AnnouncedInvoice => ({
        id: 55,
        amount: 350,
        monthIssued: '2026-10',
        dateIssued: new Date(2026, 10, 2),
        fiscalSeries: null,
        fiscalNumber: null,
        parent: { firstName: 'Ana', email: 'ana@example.com' },
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
        service = new InvoiceAnnouncementService({ render } as unknown as MailTemplateService, { queueOrRecord } as unknown as OutboxService);
    });

    afterEach(() => {
        process.env = env;
    });

    it('queues one message per invoice, to the family, in the caller transaction', async () => {
        const manager = {} as never;

        await service.announce(invoice(), manager);

        expect(render).toHaveBeenCalledWith(
            'invoice-issued',
            expect.objectContaining({ firstName: 'Ana', month: 'octombrie', amount: '350 lei', dueOn: '16 noiembrie' }),
        );
        expect(queueOrRecord).toHaveBeenCalledWith(
            { email: 'ana@example.com' },
            expect.objectContaining({ dedupeKey: `${INVOICE_ISSUED_DEDUPE_PREFIX}55` }),
            manager,
        );
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

        expect(queueOrRecord).toHaveBeenCalledWith({ email: null }, expect.anything(), undefined);
    });
});
