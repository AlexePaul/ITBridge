import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Invoice } from 'src/entities/invoice.entity';
import { Profile } from 'src/entities/profile.entity';
import { MailTemplateService } from 'src/modules/mail/mail-template.service';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { officeAddress } from 'src/modules/mail/office-address';
import { paymentsUrl } from 'src/modules/auth/portal-urls';
import { toIsoDate } from 'src/modules/class-session/class-session.dates';
import { smartBillMode } from 'src/modules/smartbill/smartbill.config';
import { dueDateFor } from './arrears.rules';
import { formatLeiRo, romanianDay, romanianMonth } from './money-words';
import { paymentReference } from './payment-reference';
import { paymentInstructions, transferDetails } from './school-identity';

/** One email per invoice, ever: the key carries nothing but the id, as a receipt's does. */
export const INVOICE_ISSUED_DEDUPE_PREFIX = 'invoice-issued:';

export type AnnouncedInvoice = Pick<Invoice, 'id' | 'amount' | 'monthIssued' | 'dateIssued' | 'fiscalSeries' | 'fiscalNumber' | 'fiscalStatus'> & {
    parent: Pick<Profile, 'id' | 'firstName' | 'email'>;
};

/**
 * Tells the family a month's invoice is there — terms §11.2 („o vezi în portal și ești anunțat pe
 * email când apare") and §13, where „factura lunii" is a service message. The template was sketched
 * by E17 and never sent: the seed even carried a sample of it in the delivery log, and nothing in the
 * code queued one, so the first a family heard of a month's bill was the reminder three days before
 * it was due.
 *
 * **When is the moment the invoice exists for the family**, and it depends on who makes the document:
 *
 * - `off` and `draft`: the platform's own invoice is the document, and it exists at issue — the
 *   email is queued in the issuing transaction;
 * - `live`: the invoice is SmartBill's, and until it has a number there is nothing to download and no
 *   reference to write on a transfer. The email goes when the number is recorded — by the fiscal
 *   queue, or by a person confirming it after a lost answer.
 *
 * A month with nothing to pay gets no email: a zero-lei invoice is a row for the school's records
 * (E15), and "nothing to pay" in an inbox reads like a mistake. `queueOrRecord`, never the marketing
 * door: this is the contract, and a family with no address leaves an `undeliverable` row, not silence.
 */
@Injectable()
export class InvoiceAnnouncementService {
    constructor(
        private readonly mailTemplates: MailTemplateService,
        private readonly outbox: OutboxService,
    ) {}

    async announce(invoice: AnnouncedInvoice, manager?: EntityManager): Promise<void> {
        if (invoice.amount <= 0) return;

        // The reference a transfer is matched by, from the one function the statement import and the
        // portal read too: the fiscal number when SmartBill gave one, the platform's own number while
        // its PDF is the invoice. Never absent here in practice — `live` announces once the number is in.
        const reference = paymentReference(invoice, smartBillMode());

        const mail = await this.mailTemplates.render('invoice-issued', {
            firstName: invoice.parent.firstName ?? '',
            month: romanianMonth(invoice.monthIssued),
            amount: formatLeiRo(invoice.amount),
            dueOn: romanianDay(toIsoDate(dueDateFor(invoice.dateIssued))),
            paymentInstructions: paymentInstructions(transferDetails(), reference?.text ?? null),
            portalUrl: paymentsUrl(),
            officeEmail: officeAddress(),
        });

        await this.outbox.queueOrRecord(
            { email: invoice.parent.email },
            {
                subject: mail.subject,
                bodyText: mail.bodyText,
                bodyHtml: mail.bodyHtml ?? undefined,
                dedupeKey: `${INVOICE_ISSUED_DEDUPE_PREFIX}${invoice.id}`,
                profileId: invoice.parent.id,
            },
            manager,
        );
    }
}
