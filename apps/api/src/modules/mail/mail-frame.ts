/**
 * The one HTML frame every message the school sends shares — E17/S2.
 *
 * A centered column that survives phone mail clients, with **inline styles only**: mail clients
 * strip `<style>` blocks with enthusiasm. Extracted out of `template-defaults.ts` when E17/S7 grew
 * a second sender that composes a body rather than filling in a template — an announcement is
 * written fresh each time and has no template key — because two copies of a frame are two frames
 * that will eventually disagree about what the school's mail looks like.
 */

/** The closing line, in the text variant. The HTML frame carries its own copy of it. */
export const SIGNATURE = ['Cu drag,', 'Echipa IT Bridge School'].join('\n');

/**
 * The two tags that close the card and the page around it. Named because `appendInsideFrame` has to
 * find them, and a second copy of them is how the two would eventually disagree.
 */
const FRAME_CLOSE = ['  </div>', '</div>'].join('\n');

export function htmlFrame(contentHtml: string): string {
    return [
        '<div style="margin:0;padding:24px 12px;background-color:#f3f2f2;font-family:Georgia,serif;color:#201f1d;">',
        '  <div style="max-width:560px;margin:0 auto;background-color:#ffffff;border:1px solid #e0dedb;border-radius:8px;padding:32px;">',
        contentHtml,
        '    <p style="margin:24px 0 0;font-size:15px;line-height:1.6;">Cu drag,<br />Echipa IT Bridge School</p>',
        FRAME_CLOSE,
    ].join('\n');
}

/**
 * Puts a block **inside** the white card, under the signature, rather than after the whole message.
 *
 * Appending to a framed body drops the block outside both `<div>`s, where it renders on the mail
 * client's own background, in the client's own font, visually detached from the message it belongs
 * to. That is wrong for anything a family is meant to read and believe — the unsubscribe line of
 * E17/S4 above all, whose entire job is to look like it came from the school.
 *
 * A body that is not framed is left alone and simply gets the block after it: an admin may have
 * replaced a template's HTML wholesale (E17/S2), and guessing at the shape of somebody else's
 * markup is worse than a plain append.
 */
export function appendInsideFrame(bodyHtml: string, blockHtml: string): string {
    const body = bodyHtml.trimEnd();
    if (!body.endsWith(FRAME_CLOSE)) return [body, blockHtml].join('\n');
    return [body.slice(0, body.length - FRAME_CLOSE.length).trimEnd(), blockHtml, FRAME_CLOSE].join('\n');
}

export const paragraph = (text: string) => `    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${text}</p>`;

export const linkBlock = (variable: string) =>
    `    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;"><a href="{{${variable}}}" style="color:#7a4a2b;">{{${variable}}}</a></p>`;
