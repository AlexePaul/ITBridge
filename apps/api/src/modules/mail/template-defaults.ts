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

import { htmlFrame, linkBlock, paragraph, SIGNATURE } from './mail-frame';
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
        key: 'absence-replacement',
        name: 'L-am mutat la altă grupă',
        description:
            'Pleacă în momentul în care biroul mută copilul, nu seara și nu automat. Spune un singur lucru, cel pe care familia nu-l știe: unde și când să-l aducă în locul orei pierdute.',
        variables: [
            { name: 'firstName', description: 'Prenumele părintelui' },
            { name: 'childName', description: 'Prenumele copilului mutat' },
            { name: 'missed', description: 'Ora pierdută — zi și oră, în cuvinte' },
            { name: 'replacement', description: 'Ora de înlocuire — grupă, zi, oră și sală' },
            { name: 'portalUrl', description: 'Linkul către absențele din cont' },
        ],
        sampleData: {
            firstName: 'Ana',
            childName: 'Maria',
            missed: 'miercuri, 9 septembrie, ora 16:00',
            replacement: 'grupa Python, joi, 10 septembrie, ora 18:00, sala Delta',
            portalUrl: 'https://itbridgeschool.com/user/absente',
        },
        subject: 'Ora de recuperare a lui {{childName}}',
        bodyText: [
            'Bună, {{firstName}}!',
            '',
            'Ne-ai anunțat din timp că {{childName}} nu ajunge la ora de {{missed}}, așa că am mutat-o pentru săptămâna asta la:',
            '',
            '{{replacement}}',
            '',
            'Nu trebuie să confirmi nimic — o așteptăm acolo. Detaliile sunt și în contul tău:',
            '',
            '{{portalUrl}}',
            '',
            'Dacă ora asta nu se potrivește, sună-ne și căutăm alta în aceeași săptămână.',
            '',
            SIGNATURE,
        ].join('\n'),
        bodyHtml: htmlFrame(
            [
                paragraph('Bună, {{firstName}}!'),
                paragraph('Ne-ai anunțat din timp că {{childName}} nu ajunge la ora de {{missed}}, așa că am mutat-o pentru săptămâna asta la:'),
                paragraph('{{replacement}}'),
                paragraph('Nu trebuie să confirmi nimic — o așteptăm acolo. Detaliile sunt și în contul tău:'),
                linkBlock('portalUrl'),
                paragraph('Dacă ora asta nu se potrivește, sună-ne și căutăm alta în aceeași săptămână.'),
            ].join('\n'),
        ),
    },
    {
        key: 'payment-due-soon',
        name: 'Factura se apropie de scadență',
        description: 'Pleacă cu trei zile înainte de termen, către o familie care nu a plătit încă. E o amintire, nu o somație.',
        variables: [
            { name: 'firstName', description: 'Prenumele părintelui' },
            { name: 'month', description: 'Luna facturată, în cuvinte' },
            { name: 'amount', description: 'Cât e de plată' },
            { name: 'dueOn', description: 'Ultima zi, în cuvinte' },
            { name: 'officeEmail', description: 'Adresa biroului' },
        ],
        sampleData: { firstName: 'Ana', month: 'martie', amount: '350 lei', dueOn: '15 martie', officeEmail: 'office@itbridgeschool.com' },
        subject: 'Factura pe {{month}}',
        bodyText: [
            'Bună, {{firstName}}!',
            '',
            'O amintire prietenoasă: factura pe {{month}}, {{amount}}, are termen până pe {{dueOn}}.',
            '',
            'Dacă ai plătit deja în ultimele zile, mesajul ăsta s-a încrucișat cu plata ta — ignoră-l.',
            'Dacă e ceva de lămurit, scrie-ne la {{officeEmail}} și rezolvăm.',
            '',
            SIGNATURE,
        ].join('\n'),
        bodyHtml: htmlFrame(
            [
                paragraph('Bună, {{firstName}}!'),
                paragraph('O amintire prietenoasă: factura pe {{month}}, <strong>{{amount}}</strong>, are termen până pe {{dueOn}}.'),
                paragraph('Dacă ai plătit deja în ultimele zile, mesajul ăsta s-a încrucișat cu plata ta — ignoră-l.'),
                paragraph('Dacă e ceva de lămurit, scrie-ne la {{officeEmail}} și rezolvăm.'),
            ].join('\n'),
        ),
    },
    {
        key: 'payment-overdue',
        name: 'Factura a depășit termenul',
        description: 'Pleacă după termen, la intervale. Tonul rămâne al unei școli care vorbește cu un părinte, nu al unui creditor.',
        variables: [
            { name: 'firstName', description: 'Prenumele părintelui' },
            { name: 'month', description: 'Luna facturată, în cuvinte' },
            { name: 'amount', description: 'Cât a rămas de plată' },
            { name: 'dueOn', description: 'Termenul care a trecut' },
            { name: 'officeEmail', description: 'Adresa biroului' },
        ],
        sampleData: { firstName: 'Ana', month: 'martie', amount: '350 lei', dueOn: '15 martie', officeEmail: 'office@itbridgeschool.com' },
        subject: 'Factura pe {{month}} a rămas neachitată',
        bodyText: [
            'Bună, {{firstName}}!',
            '',
            'Factura pe {{month}} avea termen pe {{dueOn}} și încă figurează neachitată la noi:',
            '{{amount}}.',
            '',
            'Se întâmplă, și de obicei e o scăpare, nu altceva. Dacă ai plătit și nu am înregistrat noi,',
            'spune-ne și verificăm — nu vrem să te căutăm degeaba.',
            '',
            'Dacă e o perioadă mai grea, scrie-ne la {{officeEmail}}. Preferăm să știm și să găsim o',
            'soluție împreună decât să nu mai vină copilul la ore.',
            '',
            SIGNATURE,
        ].join('\n'),
        bodyHtml: htmlFrame(
            [
                paragraph('Bună, {{firstName}}!'),
                paragraph('Factura pe {{month}} avea termen pe {{dueOn}} și încă figurează neachitată la noi: <strong>{{amount}}</strong>.'),
                paragraph(
                    'Se întâmplă, și de obicei e o scăpare, nu altceva. Dacă ai plătit și nu am înregistrat noi, spune-ne și verificăm — nu vrem să te căutăm degeaba.',
                ),
                paragraph(
                    'Dacă e o perioadă mai grea, scrie-ne la {{officeEmail}}. Preferăm să știm și să găsim o soluție împreună decât să nu mai vină copilul la ore.',
                ),
            ].join('\n'),
        ),
    },
    {
        key: 'payment-received',
        name: 'Am primit plata, factura e achitată',
        description: 'Pleacă în clipa în care o încasare acoperă factura. Confirmarea că banii au ajuns și că nu mai e nimic de plată.',
        variables: [
            { name: 'firstName', description: 'Prenumele părintelui' },
            { name: 'month', description: 'Luna facturată, în cuvinte' },
            { name: 'amount', description: 'Cât s-a încasat acum' },
            { name: 'paidOn', description: 'Ziua în care au intrat banii, în cuvinte' },
            { name: 'officeEmail', description: 'Adresa biroului' },
        ],
        sampleData: { firstName: 'Ana', month: 'martie', amount: '350 lei', paidOn: '5 martie', officeEmail: 'office@itbridgeschool.com' },
        subject: 'Am primit plata pentru {{month}}',
        bodyText: [
            'Bună, {{firstName}}!',
            '',
            'Am înregistrat {{amount}} pe {{paidOn}}. Factura pe {{month}} e achitată integral —',
            'nu mai ai nimic de plată pe ea.',
            '',
            'Dacă cifrele nu se potrivesc cu ce ai plătit tu, scrie-ne la {{officeEmail}} și verificăm.',
            '',
            SIGNATURE,
        ].join('\n'),
        bodyHtml: htmlFrame(
            [
                paragraph('Bună, {{firstName}}!'),
                paragraph(
                    'Am înregistrat <strong>{{amount}}</strong> pe {{paidOn}}. Factura pe {{month}} e achitată integral — nu mai ai nimic de plată pe ea.',
                ),
                paragraph('Dacă cifrele nu se potrivesc cu ce ai plătit tu, scrie-ne la {{officeEmail}} și verificăm.'),
            ].join('\n'),
        ),
    },
    {
        key: 'payment-received-partial',
        name: 'Am primit plata, mai rămâne o parte',
        description: 'Aceeași confirmare, când încasarea nu acoperă toată factura. Spune cât a rămas, ca familia să nu afle din următorul memento.',
        variables: [
            { name: 'firstName', description: 'Prenumele părintelui' },
            { name: 'month', description: 'Luna facturată, în cuvinte' },
            { name: 'amount', description: 'Cât s-a încasat acum' },
            { name: 'paidOn', description: 'Ziua în care au intrat banii, în cuvinte' },
            { name: 'outstanding', description: 'Cât a rămas de plată după această încasare' },
            { name: 'officeEmail', description: 'Adresa biroului' },
        ],
        sampleData: {
            firstName: 'Ana',
            month: 'martie',
            amount: '200 lei',
            paidOn: '5 martie',
            outstanding: '150 lei',
            officeEmail: 'office@itbridgeschool.com',
        },
        subject: 'Am primit plata pentru {{month}}',
        bodyText: [
            'Bună, {{firstName}}!',
            '',
            'Am înregistrat {{amount}} pe {{paidOn}}, mulțumim. Pe factura din {{month}} mai rămân',
            '{{outstanding}}.',
            '',
            'Nu e nimic de făcut acum dacă așa ați stabilit. Dacă ai plătit mai mult și noi am',
            'înregistrat mai puțin, scrie-ne la {{officeEmail}} și verificăm.',
            '',
            SIGNATURE,
        ].join('\n'),
        bodyHtml: htmlFrame(
            [
                paragraph('Bună, {{firstName}}!'),
                paragraph(
                    'Am înregistrat <strong>{{amount}}</strong> pe {{paidOn}}, mulțumim. Pe factura din {{month}} mai rămân <strong>{{outstanding}}</strong>.',
                ),
                paragraph(
                    'Nu e nimic de făcut acum dacă așa ați stabilit. Dacă ai plătit mai mult și noi am înregistrat mai puțin, scrie-ne la {{officeEmail}} și verificăm.',
                ),
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
            { name: 'phone', description: 'Telefonul din profil, sau „încă necompletat" dacă familia nu a terminat pasul doi' },
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
    {
        key: 'class-cancelled',
        name: 'Ora a fost anulată',
        description: 'Pleacă în clipa în care un admin anulează o ședință, către părinții tuturor copiilor din grupă.',
        variables: [
            { name: 'firstName', description: 'Prenumele părintelui' },
            { name: 'groupName', description: 'Numele grupei' },
            { name: 'date', description: 'Ziua orei anulate, în cuvinte' },
            { name: 'time', description: 'Ora la care ar fi început' },
            { name: 'reason', description: 'Motivul, așa cum l-a scris adminul' },
            { name: 'makeUpNote', description: 'Ce urmează: dreptul de recuperare acordat, ora nefacturată, sau recuperarea programată aici și eliberată' },
            { name: 'portalUrl', description: 'Adresa portalului' },
        ],
        sampleData: {
            firstName: 'Ana',
            groupName: 'Scratch începători',
            date: '12 martie',
            time: '16:00',
            reason: 'profesorul este bolnav',
            makeUpNote: 'Copilul tău are dreptul la o oră de recuperare, pe care o poți programa din portal în următoarele 30 de zile.',
            portalUrl: 'https://itbridgeschool.com/user/absente',
        },
        subject: 'Ora din {{date}} a fost anulată — {{groupName}}',
        bodyText: [
            'Bună, {{firstName}}!',
            '',
            'Ora de la grupa {{groupName}}, programată {{date}} la {{time}}, nu se mai ține. Motivul:',
            '{{reason}}.',
            '',
            '{{makeUpNote}}',
            '',
            'Restul orelor rămân neschimbate, iar orarul actualizat e mereu în portal:',
            '',
            '{{portalUrl}}',
            '',
            SIGNATURE,
        ].join('\n'),
        bodyHtml: htmlFrame(
            [
                paragraph('Bună, {{firstName}}!'),
                paragraph('Ora de la grupa <strong>{{groupName}}</strong>, programată {{date}} la {{time}}, nu se mai ține. Motivul: {{reason}}.'),
                paragraph('{{makeUpNote}}'),
                paragraph('Restul orelor rămân neschimbate, iar orarul actualizat e mereu în portal:'),
                linkBlock('portalUrl'),
            ].join('\n'),
        ),
    },
    {
        key: 'class-moved',
        name: 'Ora a fost mutată',
        description: 'Pleacă atunci când o ședință își schimbă ziua, ora sau sala, către părinții grupei.',
        variables: [
            { name: 'firstName', description: 'Prenumele părintelui' },
            { name: 'groupName', description: 'Numele grupei' },
            { name: 'fromWhen', description: 'Ziua, ora și sala de dinainte' },
            { name: 'toWhen', description: 'Ziua și ora nouă' },
            { name: 'room', description: 'Sala și locația unde se ține' },
            { name: 'reason', description: 'Motivul, așa cum l-a scris adminul' },
            { name: 'portalUrl', description: 'Adresa portalului' },
        ],
        sampleData: {
            firstName: 'Ana',
            groupName: 'Scratch începători',
            fromWhen: '12 martie, ora 16:00, Sala 1 — Sediul Titan',
            toWhen: '14 martie, ora 17:00',
            room: 'Sala 2 — Sediul Titan',
            reason: 'sala este ocupată de o evaluare',
            portalUrl: 'https://itbridgeschool.com/user/dashboard',
        },
        subject: 'Ora de la {{groupName}} se mută pe {{toWhen}}',
        bodyText: [
            'Bună, {{firstName}}!',
            '',
            'Ora de la grupa {{groupName}} se mută.',
            '',
            'Era: {{fromWhen}}',
            'Devine: {{toWhen}}',
            'Sala: {{room}}',
            '',
            'Motivul: {{reason}}.',
            '',
            'Orarul actualizat e în portal:',
            '',
            '{{portalUrl}}',
            '',
            SIGNATURE,
        ].join('\n'),
        bodyHtml: htmlFrame(
            [
                paragraph('Bună, {{firstName}}!'),
                paragraph('Ora de la grupa <strong>{{groupName}}</strong> se mută.'),
                paragraph('Era: {{fromWhen}}<br />Devine: <strong>{{toWhen}}</strong><br />Sala: {{room}}'),
                paragraph('Motivul: {{reason}}.'),
                paragraph('Orarul actualizat e în portal:'),
                linkBlock('portalUrl'),
            ].join('\n'),
        ),
    },
    {
        key: 'class-reinstated',
        name: 'Ora anulată se ține totuși',
        description: 'Pleacă atunci când o ședință anulată e reactivată — familia a fost anunțată că nu se ține, deci trebuie anunțată și că se ține.',
        variables: [
            { name: 'firstName', description: 'Prenumele părintelui' },
            { name: 'groupName', description: 'Numele grupei' },
            { name: 'date', description: 'Ziua orei, în cuvinte' },
            { name: 'time', description: 'Ora la care începe' },
            { name: 'portalUrl', description: 'Adresa portalului' },
        ],
        sampleData: {
            firstName: 'Ana',
            groupName: 'Scratch începători',
            date: '12 martie',
            time: '16:00',
            portalUrl: 'https://itbridgeschool.com/user/dashboard',
        },
        subject: 'Ora din {{date}} se ține totuși — {{groupName}}',
        bodyText: [
            'Bună, {{firstName}}!',
            '',
            'Revenim cu o veste bună: ora de la grupa {{groupName}} din {{date}}, ora {{time}}, se ține',
            'totuși. Te așteptăm cu cel mic, ca de obicei.',
            '',
            'Orarul e în portal:',
            '',
            '{{portalUrl}}',
            '',
            SIGNATURE,
        ].join('\n'),
        bodyHtml: htmlFrame(
            [
                paragraph('Bună, {{firstName}}!'),
                paragraph(
                    'Revenim cu o veste bună: ora de la grupa <strong>{{groupName}}</strong> din {{date}}, ora {{time}}, se ține totuși. Te așteptăm cu cel mic, ca de obicei.',
                ),
                paragraph('Orarul e în portal:'),
                linkBlock('portalUrl'),
            ].join('\n'),
        ),
    },
];

export const TEMPLATE_KEYS = TEMPLATE_DEFAULTS.map((template) => template.key);

export function templateDefault(key: string): TemplateDefinition | undefined {
    return TEMPLATE_DEFAULTS.find((template) => template.key === key);
}
