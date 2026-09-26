import type { TemplateFields } from '../modules/mail/template-render';

/**
 * The two templates the seed leaves edited, so the E17/S2 editor has a customized wording to diff
 * against the default on a fresh database.
 *
 * They are live wording, not decoration: `MailTemplateService.render` takes the school's edit over
 * the code's whenever a row exists, and stage runs on this seed. Until the end-to-end testing of 25
 * September 2026 the class-cancelled edit was written against placeholders no sender fills —
 * `{{parinte}}`, `{{grupa}}`, `{{data}}` — and the renderer leaves an unknown placeholder visible by
 * design, so every family told on stage that a class was off read the braces. The other row was
 * keyed `invoice-issued`, a message that does not exist, which the editor never lists and nothing
 * ever reads. `seed-templates.spec.ts` now holds both lines against `TEMPLATE_DEFAULTS`.
 */
export interface SeededTemplateEdit extends TemplateFields {
    key: string;
    /** How many saves the edit has behind it; the editor shows it, and 2 is the first save. */
    version: number;
}

export const SEEDED_TEMPLATE_EDITS: SeededTemplateEdit[] = [
    {
        key: 'payment-received',
        subject: 'Plata pentru {{month}} a ajuns — IT Bridge School',
        bodyText: [
            'Bună, {{firstName}}!',
            '',
            'Am primit {{amount}} pe {{paidOn}}, iar factura pe {{month}} e achitată. Mulțumim!',
            '',
            'Facturile și plățile familiei sunt în portal: {{portalUrl}}',
            'Pentru orice nelămurire, ne găsești la {{officeEmail}}.',
            '',
            'IT Bridge School',
        ].join('\n'),
        // Text only, deliberately: the editor has to show an edit that dropped the HTML variant too.
        bodyHtml: null,
        version: 2,
    },
    {
        key: 'class-cancelled',
        subject: 'Ora de la {{groupName}} din {{date}} nu se ține',
        bodyText: [
            'Bună, {{firstName}}!',
            '',
            'Ora de la grupa {{groupName}}, {{date}} la {{time}}, a fost anulată: {{reason}}.',
            '',
            '{{makeUpNote}}',
            '',
            // The sentence comes with its link: the portal for a family with an account, the contact
            // page for a trial family without one (QA of 26 September 2026).
            '{{portalNote}} {{portalUrl}}',
            '',
            'IT Bridge School',
        ].join('\n'),
        bodyHtml: null,
        version: 3,
    },
];
