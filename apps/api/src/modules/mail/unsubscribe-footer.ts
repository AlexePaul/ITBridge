import { unsubscribeUrl } from 'src/modules/auth/portal-urls';
import { appendInsideFrame } from './mail-frame';

/**
 * The refusal line every marketing message carries — E17 S4.
 *
 * Legea 506/2004 art. 12 wants a way to refuse **from inside the message**, not only a setting
 * somewhere; GDPR art. 7 alin. 3 wants withdrawing to be no harder than consenting. A parent
 * reading a newsletter on a phone that is not signed in cannot reach the toggle in the portal, so
 * the message carries the way out with it.
 *
 * Romanian, because a parent reads it. The sentence says who is writing and what stopping costs —
 * nothing else the school sends — so that refusing does not feel like refusing the invoices too.
 */
export const UNSUBSCRIBE_INTRO = 'Primești acest mesaj fiindcă ai fost de acord să îți scriem despre noutăți.';
export const UNSUBSCRIBE_REASSURANCE = 'Nu afectează facturile, anunțurile despre ore sau lucrările copilului — pe acelea le primești oricum.';

/**
 * The token the preview shows in place of a real one — E17 S4.
 *
 * The announcement preview promises to render the message that will actually go out (E17 S7), and
 * a promotional one now ends in this footer — so leaving it off would make the preview a lie about
 * the thing it exists to let somebody check. But a real family's token has no business on an admin
 * screen: the column is `select: false` precisely to keep it out of payloads. So the preview gets
 * an obviously-fake one, the same way it greets `SAMPLE_FIRST_NAME` rather than a real parent.
 */
export const SAMPLE_UNSUBSCRIBE_TOKEN = 'EXEMPLU-jetonul-real-e-unic-pentru-fiecare-familie';

/** Appended to the plain-text body. Two blank lines, so it reads as a footer rather than a sentence. */
export function withUnsubscribeText(bodyText: string, token: string): string {
    return [bodyText.trimEnd(), '', '—', UNSUBSCRIBE_INTRO, `Dacă nu mai vrei, oprește-le aici: ${unsubscribeUrl(token)}`, UNSUBSCRIBE_REASSURANCE].join('\n');
}

/**
 * Added to the HTML body, when there is one — **inside the frame**, under the signature.
 *
 * `appendInsideFrame` rather than a plain append, and the difference is not decoration: the frame
 * from E17/S2 closes two `<div>`s, so appending drops this paragraph outside the white card
 * altogether, onto the mail client's own background and into its own font. The one paragraph in the
 * message whose job is to be believed would be the one that looks bolted on by somebody else.
 *
 * The URL is escaped into the `href`: the token is ours, but a value that lands in markup and is
 * not escaped is a habit that outlives the one place it was safe.
 */
export function withUnsubscribeHtml(bodyHtml: string, token: string): string {
    const url = escapeHtml(unsubscribeUrl(token));
    return appendInsideFrame(
        bodyHtml,
        [
            '    <hr style="border:none;border-top:1px solid #e0dedb;margin:24px 0 16px;" />',
            `    <p style="margin:0;font-size:12px;line-height:1.5;color:#6b6864;">${escapeHtml(UNSUBSCRIBE_INTRO)}<br />`,
            `    Dacă nu mai vrei, <a href="${url}" style="color:#7a4a2b;">oprește-le aici</a>.<br />`,
            `    ${escapeHtml(UNSUBSCRIBE_REASSURANCE)}</p>`,
        ].join('\n'),
    );
}

function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
