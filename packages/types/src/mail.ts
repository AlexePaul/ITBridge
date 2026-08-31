import type { ISODateTime } from './common';

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
