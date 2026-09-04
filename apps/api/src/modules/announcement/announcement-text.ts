import { escapeHtml } from 'src/modules/mail/template-render';
import { htmlFrame, paragraph, SIGNATURE } from 'src/modules/mail/mail-frame';
import { foldDiacritics } from 'src/common/fold-diacritics';

/**
 * What an announcement looks like when it reaches a parent — E17/S7.
 *
 * An announcement is not a template. Templates (E17/S2) have a closed set of keys because a message
 * type without a sender is a row nothing reads; this one is written fresh every time, so what is
 * fixed is the *frame* — the greeting, the school's signature, the HTML shell — and the admin
 * supplies the middle. That division is also why the body has no `{{placeholders}}`: an admin
 * typing prose into a textarea is not editing a template, and a mistyped variable would go out as
 * literal braces to forty families with nobody left to catch it.
 */

export interface ComposedAnnouncement {
    subject: string;
    bodyText: string;
    bodyHtml: string;
}

/** The name used in the greeting when there is nobody real to greet — a preview, an empty audience. */
export const SAMPLE_FIRST_NAME = 'Ana';

/** Prefixed onto a test send, so a copy landing in the office inbox cannot be read as the real thing. */
export const TEST_SUBJECT_PREFIX = '[TEST] ';

/**
 * One recipient's copy: greeting, the admin's words, signature.
 *
 * Blank lines split the body into paragraphs in the HTML variant, which is the only formatting
 * offered — anything more would be a rich-text editor whose output has to be sanitised before it is
 * mailed to families. Every value the admin typed is escaped on the way into the HTML, for the same
 * reason a parent named O'Brien&Co is escaped in a template: it is text, not markup.
 */
export function composeAnnouncement(firstName: string, subject: string, body: string): ComposedAnnouncement {
    const greeting = `Bună, ${firstName}!`;
    const paragraphs = body
        .split(/\n\s*\n/)
        .map((block) => block.trim())
        .filter((block) => block.length > 0);

    return {
        subject,
        bodyText: [greeting, '', ...paragraphs.flatMap((block) => [block, '']), SIGNATURE].join('\n'),
        bodyHtml: htmlFrame([paragraph(escapeHtml(greeting)), ...paragraphs.map((block) => paragraph(escapeHtml(block).replace(/\n/g, '<br />')))].join('\n')),
    };
}

/**
 * Diacritics off, case off. „Ștefan" and „stefan" are the same name to anybody reading the email,
 * and the check below is about what a reader would recognise, not about byte equality.
 *
 * The fold itself moved to `src/common/fold-diacritics.ts` when E20/S2 needed the same answer about
 * the same thing — whether two spellings are one child.
 */
const fold = foldDiacritics;

/**
 * Names shorter than this are not looked for at all.
 *
 * Two-letter first names exist, and matching them would flag every announcement containing „la",
 * „de" or „an". A check that fires on everything is a checkbox people learn to tick, which is worse
 * than no check.
 */
const MIN_NAME_LENGTH = 3;

/**
 * Which children's first names appear in the text — E17/S7's one privacy rule, made mechanical.
 *
 * The rule the epic states is absolute: an announcement addresses a group, a location or the school,
 * and **must not carry data about a particular child**. „Un anunț care numește un copil e o
 * scurgere, nu un anunț." What it names as the place to catch that is the preview before sending,
 * which only works if the thing to be caught can be seen — so this is what the preview points at.
 *
 * It is a **warning, not a block**, and takes the same shape as the age check in E11/S6: the first
 * request refuses with the names in the message, a second carrying `acknowledgeWarnings` goes
 * through. False positives are certain — Maria is a room as often as a child in Romanian — and a
 * hard refusal would make the school's own vocabulary unusable. What the warning buys is that
 * nobody sends „îl felicităm pe Andrei" to two hundred families without having been asked once.
 *
 * The names come from every child on file, not only the audience's. Naming a child who is not in
 * the room is not less of a leak; it is the same sentence read by more strangers.
 */
export function childNamesIn(text: string, firstNames: readonly string[]): string[] {
    const haystack = fold(text);
    const found = new Map<string, string>();

    for (const name of firstNames) {
        const folded = fold(name.trim());
        if (folded.length < MIN_NAME_LENGTH || found.has(folded)) continue;
        // Word boundaries written out rather than `\b`: the haystack is folded to ASCII letters,
        // but a name may still sit against a digit or an apostrophe, and `\b` would call that a
        // match on „Ana2" as readily as on „Ana".
        const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(folded)}(?![\\p{L}\\p{N}])`, 'u');
        if (pattern.test(haystack)) found.set(folded, name.trim());
    }

    return [...found.values()];
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
