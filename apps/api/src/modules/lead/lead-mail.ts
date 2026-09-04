import { htmlFrame, paragraph, SIGNATURE } from 'src/modules/mail/mail-frame';
import { escapeHtml } from 'src/modules/mail/template-render';

/**
 * Everything E20 says out loud — E20/S2 and S3.
 *
 * Plain functions, apart from the services that queue them, so the wording can be asserted without
 * a queue or a database behind it. Romanian, because a parent reads it.
 *
 * **Nothing here promises an enrolment, a seat in a group, or an account.** That is the whole of
 * the epic's decision that enrolment is not self-service, expressed where it actually reaches a
 * family: a trial is booked, somebody will call afterwards, and that is all. A confirmation that
 * said "your place is reserved" or "log in to continue" would be the platform making a promise the
 * school has not made.
 */

export interface ComposedMessage {
    subject: string;
    bodyText: string;
    bodyHtml: string;
}

const compose = (subject: string, lines: string[]): ComposedMessage => {
    const bodyText = [...lines, '', SIGNATURE].join('\n');
    const bodyHtml = htmlFrame(
        lines
            .filter((line) => line !== '')
            .map((line) => paragraph(escapeHtml(line)))
            .join('\n'),
    );
    return { subject, bodyText, bodyHtml };
};

export interface TrialDetails {
    childFirstName: string;
    groupName: string;
    locationName: string;
    address: string;
    /** The class itself: a date and a start time, already on the school's clock. */
    date: string;
    startTime: string;
}

/** "marți, 15 septembrie 2026" — the day as somebody would say it. */
export function formatRomanianDate(date: string): string {
    return new Intl.DateTimeFormat('ro-RO', {
        timeZone: 'Europe/Bucharest',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    }).format(new Date(`${date}T12:00:00Z`));
}

/** "17:00" — the stored `HH:mm:ss` without the seconds nobody reads. */
export const formatHour = (time: string): string => time.slice(0, 5);

export function composeTrialConfirmation(trial: TrialDetails): ComposedMessage {
    const where = `${trial.locationName}, ${trial.address}`;
    return compose(`Lecția de probă a lui ${trial.childFirstName} este programată`, [
        'Bună!',
        '',
        `Am notat lecția de probă a lui ${trial.childFirstName}:`,
        '',
        `${formatRomanianDate(trial.date)}, ora ${formatHour(trial.startTime)}`,
        `Grupa ${trial.groupName}, ${where}`,
        '',
        'Proba este gratuită. Vino cu 5-10 minute înainte, ca să facem cunoștință în liniște.',
        'Calculatoarele sunt ale noastre, deci nu trebuie să aduci nimic.',
        '',
        'După probă te sunăm ca să vedem cum i s-a părut și ce urmează.',
        'Dacă nu mai poți ajunge, răspunde la acest email sau sună-ne — locul merge mai departe altui copil.',
    ]);
}

/** The day-before reminder. Not a refinement: without it, no-shows at a free trial run to a third. */
export function composeTrialReminder(trial: TrialDetails): ComposedMessage {
    const where = `${trial.locationName}, ${trial.address}`;
    return compose(`Mâine este lecția de probă a lui ${trial.childFirstName}`, [
        'Bună!',
        '',
        `Îți amintim că mâine, ${formatRomanianDate(trial.date)}, la ora ${formatHour(trial.startTime)},`,
        `${trial.childFirstName} are lecția de probă la grupa ${trial.groupName}.`,
        '',
        `Ne vedem la ${where}.`,
        '',
        'Dacă nu mai puteți ajunge, spune-ne — putem programa altă zi, iar locul rămâne liber pentru altcineva.',
    ]);
}

/**
 * The message that goes out when the class happened and the child was not there.
 *
 * Transactional, not marketing: this is an answer about the thing the family themselves asked for,
 * to an address they gave for exactly this purpose. It offers another date and nothing else — a
 * no-show is not an opening to sell.
 */
export function composeNoShowFollowUp(trial: TrialDetails): ComposedMessage {
    return compose(`Ne-ai lipsit la proba de ${formatRomanianDate(trial.date)}`, [
        'Bună!',
        '',
        `${trial.childFirstName} era așteptat la lecția de probă de ${formatRomanianDate(trial.date)}, ora ${formatHour(trial.startTime)},`,
        'și nu ne-am văzut. Se întâmplă — o zi aglomerată, o răceală, un drum mai lung decât părea.',
        '',
        'Dacă vrei, îi găsim altă oră. Răspunde la acest email sau sună-ne și o programăm împreună.',
    ]);
}

export interface OfficeDigest {
    /** Nobody has touched these for a week or more. */
    stale: { id: number; parentName: string; childFirstName: string; days: number; status: string }[];
    /** Trials that happened and that nobody has decided about — the screen S3 is built around. */
    undecided: { id: number; parentName: string; childFirstName: string; days: number }[];
    /** Families we had no seat for. Somebody has to ring them; nothing else will. */
    noSeats: { id: number; parentName: string; childFirstName: string; days: number }[];
    /** Leads with no owner at all, which is the loudest case of the three. */
    unassigned: number;
}

export const officeDigestIsEmpty = (digest: OfficeDigest): boolean =>
    digest.stale.length === 0 && digest.undecided.length === 0 && digest.noSeats.length === 0 && digest.unassigned === 0;

/**
 * One message a day to the office, or none — E20/S3.
 *
 * The order is the order of what it costs to lose: a family that came to a trial has already been
 * given a seat, a teacher and an hour, so they head the list. Then the ones nobody could seat, then
 * everything gone quiet.
 */
export function composeOfficeDigest(digest: OfficeDigest): ComposedMessage {
    const lines = ['Bună!', ''];

    if (digest.undecided.length > 0) {
        lines.push(`Probe ținute, fără decizie (${digest.undecided.length}):`);
        for (const lead of digest.undecided) {
            lines.push(`- ${lead.childFirstName} (${lead.parentName}) — de ${lead.days} ${dayWord(lead.days)}`);
        }
        lines.push('');
    }

    if (digest.noSeats.length > 0) {
        lines.push(`Cereri fără loc liber (${digest.noSeats.length}):`);
        for (const lead of digest.noSeats) {
            lines.push(`- ${lead.childFirstName} (${lead.parentName}) — de ${lead.days} ${dayWord(lead.days)}`);
        }
        lines.push('');
    }

    if (digest.stale.length > 0) {
        lines.push(`Fără nicio mișcare de o săptămână sau mai mult (${digest.stale.length}):`);
        for (const lead of digest.stale) {
            lines.push(`- ${lead.childFirstName} (${lead.parentName}) — ${lead.status}, de ${lead.days} ${dayWord(lead.days)}`);
        }
        lines.push('');
    }

    if (digest.unassigned > 0) {
        lines.push(`${digest.unassigned} ${digest.unassigned === 1 ? 'cerere nu are' : 'cereri nu au'} pe nimeni în dreptul lor.`);
        lines.push('');
    }

    lines.push('Lista completă: /admin/leads');

    return compose('Cereri care așteaptă un răspuns', lines);
}

const dayWord = (days: number): string => (days === 1 ? 'zi' : 'zile');
