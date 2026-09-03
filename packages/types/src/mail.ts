import type { ISODate, ISODateTime } from './common';

/**
 * The mail template editor's wire shapes — E17/S2.
 *
 * The set of template keys is closed: it is the list in the API's `template-defaults.ts`, because
 * a template without a sender is a row nothing will ever read. The editor customizes wording; it
 * cannot invent a message type.
 */

export interface MailTemplateSummary {
    key: string;
    /** What the admin screen calls it. */
    name: string;
    /** One sentence on when the message goes out. */
    description: string;
    /** True when the school's wording is in force instead of the code's. */
    customized: boolean;
    /** 1 is the code's wording; every save adds one. */
    version: number;
    updatedAt: ISODateTime | null;
}

export interface MailTemplateFields {
    subject: string;
    bodyText: string;
    /** Null means the message goes out text-only. */
    bodyHtml: string | null;
}

export interface MailTemplateDetail extends MailTemplateFields {
    key: string;
    name: string;
    description: string;
    customized: boolean;
    version: number;
    /** The variables the template understands — what `{{name}}` may name. */
    variables: { name: string; description: string }[];
    /** What the preview renders with. */
    sampleData: Record<string, string>;
    /** The code's wording, so the editor can show what revert restores. */
    default: MailTemplateFields;
}

/** What a preview answers: the fields, rendered with the sample data. */
export type MailTemplateRendered = MailTemplateFields;

export interface UpdateMailTemplateDto {
    subject: string;
    bodyText: string;
    bodyHtml?: string | null;
}

/** The editor's unsaved fields; whatever is absent previews as currently saved. */
export interface PreviewMailTemplateDto {
    subject?: string;
    bodyText?: string;
    bodyHtml?: string | null;
}

/**
 * Where a queued message is in its life — E17/S3 and S5. Mirrors `OutboxStatus` in
 * `apps/api/src/enum/outbox-status.enum.ts`.
 *
 * `undeliverable` is the one E17/S5 added: never attempted, because there was nowhere to send it.
 * Terminal — no backoff makes an address appear. `digested` is S6's: folded into a combined message
 * which went instead, so the family did read it — just not in an envelope of its own. Also terminal,
 * and deliberately not `sent`, because this row never reached the provider.
 */
export type DeliveryStatus = 'pending' | 'sent' | 'failed' | 'undeliverable' | 'digested';

/**
 * Why a message had nowhere to go. Two values, not one: they look identical in a list and are
 * resolved differently — the first needs a phone call, the second a resent confirmation link.
 *
 * Not `UndeliverableReason`: E14's send report already owns that name for the same two cases in
 * different words. These are E17/S5's own, and canonical.
 */
export type DeliveryFailureReason = 'no_address' | 'unconfirmed_address';

/**
 * One row of the delivery record — E17/S5.
 *
 * Answers „a primit părintele anunțul?", including for messages that never left. The body comes
 * along because an admin asking whether a family was told needs to see what they would have been
 * told.
 */
export interface DeliveryRecord {
    id: number;
    /** Empty when there was no address — never a placeholder, which would look like a real one. */
    to: string;
    subject: string;
    bodyText: string;
    bodyHtml: string | null;
    status: DeliveryStatus;
    /** Set only on `undeliverable`. */
    undeliverableReason: DeliveryFailureReason | null;
    attempts: number;
    lastError: string | null;
    createdAt: ISODateTime;
    sentAt: ISODateTime | null;
}

/** How many messages sit in each state. Every state present, even at zero. */
export type DeliverySummary = Record<DeliveryStatus, number>;

export interface DeliveryLogFilter {
    status?: DeliveryStatus;
    to?: string;
    from?: ISODate;
    until?: ISODate;
    limit?: number;
}
