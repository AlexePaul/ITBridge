/**
 * The default wording of every template — E17/S2.
 *
 * In code, next to the variables each template understands and the sample data the preview uses.
 * The database holds only what the school has edited (`MailTemplate`); anything not edited renders
 * from here. The texts themselves are the ones `account-mail.ts` used to interpolate directly —
 * same sentences, with `{{placeholders}}` where the values went.
 *
 * Romanian bodies, per the standing exception: parents read these. Identifiers stay English.
 */

import { TemplateFields } from './template-render';

export interface TemplateDefinition extends TemplateFields {
    key: string;
    /** What the admin screen calls it. */
    name: string;
    /** One sentence on when the message goes out. */
    description: string;
    /** The variables the template understands, with what each one holds. */
    variables: { name: string; description: string }[];
    /** What the preview renders with. Realistic, obviously fake. */
    sampleData: Record<string, string>;
}

const SIGNATURE = ['Cu drag,', 'Echipa IT Bridge School'].join('\n');

/**
 * The one HTML frame every template shares: a centered column that survives phone mail clients.
 * Inline styles only — mail clients strip <style> blocks with enthusiasm.
 */
function htmlFrame(contentHtml: string): string {
    return [
        '<div style="margin:0;padding:24px 12px;background-color:#f3f2f2;font-family:Georgia,serif;color:#201f1d;">',
        '  <div style="max-width:560px;margin:0 auto;background-color:#ffffff;border:1px solid #e0dedb;border-radius:8px;padding:32px;">',
        contentHtml,
        '    <p style="margin:24px 0 0;font-size:15px;line-height:1.6;">Cu drag,<br />Echipa IT Bridge School</p>',
        '  </div>',
        '</div>',
    ].join('\n');
}

const paragraph = (text: string) => `    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${text}</p>`;
const linkBlock = (variable: string) =>
    `    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;"><a href="{{${variable}}}" style="color:#7a4a2b;">{{${variable}}}</a></p>`;

export const TEMPLATE_DEFAULTS: readonly TemplateDefinition[] = [
    {
        key: 'email-confirmation',
        name: 'Confirmarea adresei de email',
        description: 'Pleacă la înregistrare, către adresa pe care a tastat-o părintele.',
        variables: [
            { name: 'firstName', description: 'Prenumele părintelui' },
            { name: 'confirmUrl', description: 'Linkul de confirmare, valabil 48 de ore' },
        ],
        sampleData: { firstName: 'Ana', confirmUrl: 'https://itbridgeschool.com/confirmare/exemplu' },
        subject: 'Confirmă adresa de email — IT Bridge School',
        bodyText: [
            'Bună, {{firstName}}!',
            '',
            'Ai creat un cont pe platforma IT Bridge School. Ca să confirmi că adresa aceasta este a ta,',
            'deschide linkul de mai jos:',
            '',
            '{{confirmUrl}}',
            '',
            'Linkul e valabil 48 de ore. După ce îl deschizi, contul mai are nevoie de o aprobare din',
            'partea noastră — te anunțăm printr-un email când e gata, de obicei în aceeași zi lucrătoare.',
            '',
            'Dacă nu tu ai cerut contul, ignoră mesajul: fără confirmare, contul nu poate fi folosit.',
            '',
            SIGNATURE,
        ].join('\n'),
        bodyHtml: htmlFrame(
            [
                paragraph('Bună, {{firstName}}!'),
                paragraph('Ai creat un cont pe platforma IT Bridge School. Ca să confirmi că adresa aceasta este a ta, deschide linkul de mai jos:'),
                linkBlock('confirmUrl'),
                paragraph(
                    'Linkul e valabil 48 de ore. După ce îl deschizi, contul mai are nevoie de o aprobare din partea noastră — te anunțăm printr-un email când e gata, de obicei în aceeași zi lucrătoare.',
                ),
                paragraph('Dacă nu tu ai cerut contul, ignoră mesajul: fără confirmare, contul nu poate fi folosit.'),
            ].join('\n'),
        ),
    },
    {
        key: 'account-approved',
        name: 'Contul a fost aprobat',
        description: 'Pleacă în clipa în care un admin aprobă familia, ca așteptarea să se termine cu un mesaj, nu cu o bănuială.',
        variables: [
            { name: 'firstName', description: 'Prenumele părintelui' },
            { name: 'portalUrl', description: 'Adresa de autentificare' },
        ],
        sampleData: { firstName: 'Ana', portalUrl: 'https://itbridgeschool.com/login' },
        subject: 'Contul tău IT Bridge School e activ',
        bodyText: [
            'Bună, {{firstName}}!',
            '',
            'Contul tău a fost aprobat. Te poți autentifica aici:',
            '',
            '{{portalUrl}}',
            '',
            'Următorul pas îl facem noi: îți repartizăm copilul într-o grupă potrivită ca vârstă și',
            'nivel. Dacă nu ne-am auzit încă despre asta, scrie-ne sau sună-ne și stabilim împreună.',
            '',
            SIGNATURE,
        ].join('\n'),
        bodyHtml: htmlFrame(
            [
                paragraph('Bună, {{firstName}}!'),
                paragraph('Contul tău a fost aprobat. Te poți autentifica aici:'),
                linkBlock('portalUrl'),
                paragraph(
                    'Următorul pas îl facem noi: îți repartizăm copilul într-o grupă potrivită ca vârstă și nivel. Dacă nu ne-am auzit încă despre asta, scrie-ne sau sună-ne și stabilim împreună.',
                ),
            ].join('\n'),
        ),
    },
    {
        key: 'account-rejected',
        name: 'Contul nu a fost activat',
        description: 'Pleacă atunci când un admin refuză un cont. Motivul refuzului rămâne în registru — e o notă între admini, nu o scrisoare.',
        variables: [
            { name: 'firstName', description: 'Prenumele părintelui' },
            { name: 'officeEmail', description: 'Adresa biroului, pentru contestații' },
        ],
        sampleData: { firstName: 'Ana', officeEmail: 'office@itbridgeschool.com' },
        subject: 'Despre contul tău IT Bridge School',
        bodyText: [
            'Bună, {{firstName}}!',
            '',
            'Îți mulțumim pentru interesul față de IT Bridge School. Deocamdată nu am putut activa contul',
            'creat cu această adresă.',
            '',
            'Dacă ți se pare o greșeală — și se poate întâmpla — scrie-ne la {{officeEmail}} și ne uităm încă o dată.',
            '',
            SIGNATURE,
        ].join('\n'),
        bodyHtml: htmlFrame(
            [
                paragraph('Bună, {{firstName}}!'),
                paragraph('Îți mulțumim pentru interesul față de IT Bridge School. Deocamdată nu am putut activa contul creat cu această adresă.'),
                paragraph('Dacă ți se pare o greșeală — și se poate întâmpla — scrie-ne la {{officeEmail}} și ne uităm încă o dată.'),
            ].join('\n'),
        ),
    },
    {
        key: 'absence-noticed',
        name: 'Copilul a lipsit, fără să fi anunțat cineva',
        description:
            'Pleacă seara, către familia unui copil marcat absent la o oră pe care nimeni n-a anunțat-o. Mesaj tranzacțional — nu ține de preferința de marketing.',
        variables: [
            { name: 'firstName', description: 'Prenumele părintelui' },
            { name: 'absences', description: 'Lista absențelor de azi, câte una pe rând' },
            { name: 'officeEmail', description: 'Adresa biroului' },
        ],
        sampleData: {
            firstName: 'Ana',
            absences: '· Maria — Scratch Începători, luni 16:00',
            officeEmail: 'office@itbridgeschool.com',
        },
        subject: 'Copilul tău nu a fost azi la curs',
        bodyText: [
            'Bună, {{firstName}}!',
            '',
            'Îți scriem fiindcă azi nu ne-am văzut cu:',
            '',
            '{{absences}}',
            '',
            'Dacă știai și e în regulă, ignoră mesajul — data viitoare ne poți anunța din contul tău,',
            'de la „Absențe și recuperări", și atunci nu-ți mai scriem.',
            '',
            'Dacă nu știai, sună-ne la numărul din contract sau scrie-ne la {{officeEmail}}.',
            '',
            SIGNATURE,
        ].join('\n'),
        bodyHtml: htmlFrame(
            [
                paragraph('Bună, {{firstName}}!'),
                paragraph('Îți scriem fiindcă azi nu ne-am văzut cu:'),
                paragraph('{{absences}}'),
                paragraph(
                    'Dacă știai și e în regulă, ignoră mesajul — data viitoare ne poți anunța din contul tău, de la „Absențe și recuperări", și atunci nu-ți mai scriem.',
                ),
                paragraph('Dacă nu știai, sună-ne la numărul din contract sau scrie-ne la {{officeEmail}}.'),
            ].join('\n'),
        ),
    },
    {
        key: 'make-up-expiring',
        name: 'Recuperarea expiră în curând',
        description: 'Pleacă cu câteva zile înainte ca o recuperare neprogramată să expire. Tranzacțional: e un drept al familiei, nu o ofertă.',
        variables: [
            { name: 'firstName', description: 'Prenumele părintelui' },
            { name: 'childName', description: 'Prenumele copilului' },
            { name: 'expiresOn', description: 'Ultima zi în care mai poate fi folosită' },
            { name: 'portalUrl', description: 'Linkul către ecranul de programare' },
        ],
        sampleData: {
            firstName: 'Ana',
            childName: 'Maria',
            expiresOn: '7 octombrie',
            portalUrl: 'https://itbridgeschool.com/user/absente',
        },
        subject: 'Recuperarea lui {{childName}} expiră în curând',
        bodyText: [
            'Bună, {{firstName}}!',
            '',
            '{{childName}} are o oră de recuperare nefolosită, iar ultima zi în care poate fi programată',
            'este {{expiresOn}}.',
            '',
            'O programezi singur, din contul tău:',
            '',
            '{{portalUrl}}',
            '',
            'Dacă nu se potrivește nicio oră, scrie-ne și găsim împreună.',
            '',
            SIGNATURE,
        ].join('\n'),
        bodyHtml: htmlFrame(
            [
                paragraph('Bună, {{firstName}}!'),
                paragraph('{{childName}} are o oră de recuperare nefolosită, iar ultima zi în care poate fi programată este <strong>{{expiresOn}}</strong>.'),
                paragraph('O programezi singur, din contul tău:'),
                linkBlock('portalUrl'),
                paragraph('Dacă nu se potrivește nicio oră, scrie-ne și găsim împreună.'),
            ].join('\n'),
        ),
    },
    {
        key: 'approval-needed',
        name: 'Cont nou în așteptare (intern)',
        description: 'Mesajul intern către birou: o familie s-a înregistrat și așteaptă aprobarea. Singurul destinatar e școala.',
        variables: [
            { name: 'parentName', description: 'Numele complet al părintelui' },
            { name: 'email', description: 'Adresa cu care s-a înregistrat' },
            { name: 'phone', description: 'Telefonul din profil' },
            { name: 'approvalsUrl', description: 'Linkul către ecranul de aprobări' },
        ],
        sampleData: {
            parentName: 'Ana Popescu',
            email: 'ana.popescu@exemplu.ro',
            phone: '+40712345678',
            approvalsUrl: 'https://itbridgeschool.com/admin/approvals',
        },
        subject: 'Cont nou de părinte: {{parentName}}',
        bodyText: [
            '{{parentName}} și-a creat un cont și așteaptă aprobare.',
            '',
            'Email: {{email}}',
            'Telefon: {{phone}}',
            '',
            'Ecranul de aprobări:',
            '{{approvalsUrl}}',
            '',
            'Contul nu poate fi folosit până când nu e și confirmat prin email, și aprobat de un admin.',
            'Ecranul arată amândouă stările.',
            '',
            'Mesaj automat.',
        ].join('\n'),
        // Internal message — text is the whole point, nobody styles a nudge.
        bodyHtml: null,
    },
];

export const TEMPLATE_KEYS = TEMPLATE_DEFAULTS.map((template) => template.key);

export function templateDefault(key: string): TemplateDefinition | undefined {
    return TEMPLATE_DEFAULTS.find((template) => template.key === key);
}
