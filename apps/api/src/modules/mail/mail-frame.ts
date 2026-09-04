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

export function htmlFrame(contentHtml: string): string {
    return [
        '<div style="margin:0;padding:24px 12px;background-color:#f3f2f2;font-family:Georgia,serif;color:#201f1d;">',
        '  <div style="max-width:560px;margin:0 auto;background-color:#ffffff;border:1px solid #e0dedb;border-radius:8px;padding:32px;">',
        contentHtml,
        '    <p style="margin:24px 0 0;font-size:15px;line-height:1.6;">Cu drag,<br />Echipa IT Bridge School</p>',
        '  </div>',
        '</div>',
    ].join('\n');
}

export const paragraph = (text: string) => `    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">${text}</p>`;

export const linkBlock = (variable: string) =>
    `    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;"><a href="{{${variable}}}" style="color:#7a4a2b;">{{${variable}}}</a></p>`;
