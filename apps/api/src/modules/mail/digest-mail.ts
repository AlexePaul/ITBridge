import { escapeHtml } from './template-render';
import { htmlFrame, paragraph, SIGNATURE } from './mail-frame';

/**
 * The one envelope several messages arrive in — E17/S6.
 *
 * Composed here rather than from a template (E17/S2) because a digest has no wording of its own
 * worth editing: everything a parent reads in it was written by the message that contributed it.
 * What this adds is the greeting, the order and the signature — the parts that exist precisely
 * *once* per envelope, which is the whole point of combining.
 *
 * Romanian, per the standing exception: parents read these.
 */

export interface DigestItem {
    /** The subject the message would have had on its own; becomes the section heading. */
    subject: string;
    /** The paragraph the sender wrote for this purpose. No greeting, no signature. */
    summary: string;
}

export interface ComposedDigest {
    subject: string;
    bodyText: string;
    bodyHtml: string;
}

/**
 * The subject line names the first item and counts the rest.
 *
 * „Ai o oră de recuperare (și încă 2 lucruri)" rather than a standing „Noutăți de la școală": a
 * subject that is the same every time is a subject nobody reads, and the thing a parent most needs
 * from an inbox list is whether this one is about money, an hour, or their child's work.
 */
export function digestSubject(items: DigestItem[]): string {
    const [first, ...rest] = items;
    if (rest.length === 0) return first.subject;
    return `${first.subject} (și încă ${rest.length} ${rest.length === 1 ? 'lucru' : 'lucruri'})`;
}

export function composeDigest(parentFirstName: string, items: DigestItem[]): ComposedDigest {
    const intro =
        items.length === 2
            ? 'Am strâns într-un singur email cele două lucruri de azi, ca să nu îți umplem inbox-ul:'
            : `Am strâns într-un singur email cele ${items.length} lucruri de azi, ca să nu îți umplem inbox-ul:`;

    return {
        subject: digestSubject(items),
        bodyText: [`Bună, ${parentFirstName}!`, '', intro, '', ...items.flatMap((item) => [`— ${item.subject}`, item.summary, '']), SIGNATURE].join('\n'),
        bodyHtml: htmlFrame(
            [
                paragraph(escapeHtml(`Bună, ${parentFirstName}!`)),
                paragraph(escapeHtml(intro)),
                ...items.map((item) => paragraph(`<strong>${escapeHtml(item.subject)}</strong><br />${escapeHtml(item.summary).replace(/\n/g, '<br />')}`)),
            ].join('\n'),
        ),
    };
}
