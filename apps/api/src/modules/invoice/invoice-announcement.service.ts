import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Invoice } from 'src/entities/invoice.entity';
import { Profile } from 'src/entities/profile.entity';
import { MailTemplateService } from 'src/modules/mail/mail-template.service';
import { OutboxService } from 'src/modules/mail/outbox.service';
import { officeAddress } from 'src/modules/mail/office-address';
import { paymentsUrl } from 'src/modules/auth/portal-urls';
import { toIsoDate } from 'src/modules/class-session/class-session.dates';
import { smartBillMode } from 'src/modules/smartbill/smartbill.config';
import { dueDateFor, outstandingOf } from './arrears.rules';
import { formatLeiRo, romanianDay, romanianMonth } from './money-words';
import { paymentReference } from './payment-reference';
import { paymentInstructions, transferDetails } from './school-identity';
import { familyAccount, familyLink } from 'src/modules/mail/portal-line';
import { PaymentStatus } from 'src/enum/payment-status.enum';

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
        private readonly dataSource: DataSource,
    ) {}

    async announce(invoice: AnnouncedInvoice, manager?: EntityManager): Promise<void> {
        if (invoice.amount <= 0) return;
        const reader = manager ?? this.dataSource.manager;

        // What is left, not the total — the rule for everything a family reads as "de plătit". At
        // issue in `off` and `draft` nothing has been paid yet; in `live` the email waits for
        // SmartBill's number, and a refusal or a review can hold that for days while the family pays
        // at the office. A month already settled by then says nothing more: its receipt said it.
        const outstanding = outstandingOf(invoice.amount, await this.paidOn(reader, invoice.id));
        if (outstanding <= 0) return;

        // The reference a transfer is matched by, from the one function the statement import and the
        // portal read too: the fiscal number when SmartBill gave one, the platform's own number while
        // its PDF is the invoice. Never absent here in practice — `live` announces once the number is in.
        const reference = paymentReference(invoice, smartBillMode());

        const account = await familyAccount(reader, invoice.parent.id);
        const mail = await this.mailTemplates.render('invoice-issued', {
            firstName: invoice.parent.firstName ?? '',
            month: romanianMonth(invoice.monthIssued),
            amount: formatLeiRo(outstanding),
            dueOn: romanianDay(toIsoDate(dueDateFor(invoice.dateIssued))),
            paymentInstructions: paymentInstructions(transferDetails(), reference?.text ?? null),
            // The portal for a family that can sign in; one the office typed in has no account, and
            // a suspended one cannot use it, so both are told to ask for the PDF (QA of 27 September).
            ...familyLink(
                account.canSignIn,
                { note: 'Factura se descarcă din portal, unde vezi și plățile înregistrate:', url: paymentsUrl() },
                'Dacă vrei factura în PDF, scrie-ne și ți-o trimitem:',
            ),
            officeEmail: officeAddress(),
        });

        // The address gate (E11/S2): an amount, a reference and an account number do not go to an
        // address the family has not proven since it last changed it.
        await this.outbox.queueOrRecord(
            { email: invoice.parent.email, confirmed: account.addressProven },
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

    /** The money received on the invoice — succeeded payments only, as `ArrearsService` counts it. */
    private async paidOn(manager: EntityManager, invoiceId: number): Promise<number> {
        const [row] = await manager.query<{ paid: string | null }[]>(
            'SELECT COALESCE(SUM(amount), 0) AS paid FROM payments WHERE invoice_id = $1 AND status = $2',
            [invoiceId, PaymentStatus.SUCCEEDED],
        );
        return Number(row?.paid ?? 0);
    }
}
