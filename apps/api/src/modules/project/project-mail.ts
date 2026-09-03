/**
 * What a parent receives when an admin presses send. E14/S4, carried by E17/S8.
 *
 * Plain functions, exported away from the service that queues them, so the wording can be asserted
 * without a queue or a database behind it — the same split as E12's reminder; the account mails have since moved to E17/S2 templates.
 *
 * Romanian, because parents read these. That is the exception CLAUDE.md carves out of the
 * everything-in-English rule; identifiers and comments here stay English.
 */

/** What the school signs off as. Written once, as in every other message. */
const SIGNATURE = ['Cu drag,', 'Echipa IT Bridge School'].join('\n');

export interface ComposedMail {
    subject: string;
    bodyText: string;
    bodyHtml?: string;
    /**
     * The paragraph this message contributes when it arrives combined with others — E17/S6.
     *
     * Written here, next to the message it stands for, rather than assembled by the queue: the
     * queue has the body but not the sense of it, and a summary derived from a body is a summary
     * that goes stale the first time somebody edits the wording above.
     */
    digestSummary?: string;
}

/** One document in the message: whose it is, what it is called, and where it opens. */
export interface DeliveredProject {
    childFirstName: string;
    title: string;
    /** The `/files/<uuid>` link. Requires a login; carries no name and no storage URL. */
    url: string;
    /**
     * The `cid:` reference of the thumbnail attached to this message, when there is one. Absent
     * means the message simply has no picture for that document — never a broken image.
     */
    contentId?: string;
}

/**
 * The message itself. One per parent, however many children and documents it covers.
 *
 * **The split is per parent, not per child.** A parent with two children in the same send gets one
 * email listing both, because two messages within a minute of each other is the burst E17/S6 exists
 * to prevent, and being triggered by a human is not a loophole through it.
 *
 * **There is no "ce s-a învățat" line**, and its absence is deliberate rather than forgotten: the
 * text would come from the lesson in E10, which is out of MVP. The email works without it — a
 * picture, a title and a way in — and the line appears when modules exist.
 */
export function composeProjectDelivery(parentFirstName: string, projects: DeliveredProject[], galleryUrl: string): ComposedMail {
    const children = uniqueChildNames(projects);
    const intro =
        projects.length === 1
            ? `${children[0]} a lucrat la ceva la cursul de săptămâna asta și îți trimitem rezultatul.`
            : `${joinNames(children)} au lucrat la câteva lucruri la curs, iar mai jos sunt rezultatele.`;

    const bodyText = [
        `Bună, ${parentFirstName}!`,
        '',
        intro,
        '',
        ...projects.map((project) => [`${project.childFirstName} — ${project.title}`, project.url, ''].join('\n')),
        'Linkurile cer autentificare, ca lucrarea copilului să nu se deschidă pentru oricine primește mesajul mai departe.',
        '',
        `Toate proiectele copiilor tăi sunt aici: ${galleryUrl}`,
        '',
        'Dacă un document nu pare să fie al copilului tău, spune-ne — se întâmplă ca o lucrare să fie salvată din greșeală în alt folder.',
        '',
        SIGNATURE,
    ].join('\n');

    return {
        subject: subjectFor(children, projects.length),
        bodyText,
        bodyHtml: renderHtml(parentFirstName, intro, projects, galleryUrl),
        // The links, not the pictures: a combined message carries no attachments, so a `cid:`
        // reference in here would render as a broken image. Nothing is hidden — every document is
        // still named and still one click away.
        digestSummary: [intro, '', ...projects.map((project) => `· ${project.childFirstName} — ${project.title}: ${project.url}`)].join('\n'),
    };
}

function subjectFor(children: string[], count: number): string {
    if (children.length === 1) {
        return count === 1 ? `Ce a construit ${children[0]} la curs` : `Ce a construit ${children[0]} la curs (${count} lucrări)`;
    }
    return `Ce au construit ${joinNames(children)} la curs`;
}

/**
 * The HTML half.
 *
 * Inline styles and a table-free layout, because this is read in Gmail, Outlook and whatever the
 * parent's phone came with, none of which reliably applies a stylesheet. The thumbnail is a
 * `cid:` reference to an attachment on the same message — not a signed URL, which would be a broken
 * image by the next morning, and not a long-lived one, which would leave a picture of a minor's
 * work reachable from a mailbox forever.
 */
function renderHtml(parentFirstName: string, intro: string, projects: DeliveredProject[], galleryUrl: string): string {
    const items = projects
        .map((project) => {
            const image = project.contentId
                ? `<div style="margin:0 0 10px"><img src="cid:${escapeHtml(project.contentId)}" alt="${escapeHtml(project.title)}" style="max-width:100%;border-radius:8px;display:block" /></div>`
                : '';
            return [
                '<div style="margin:0 0 28px">',
                image,
                `<div style="font-weight:600;font-size:16px">${escapeHtml(project.childFirstName)} — ${escapeHtml(project.title)}</div>`,
                `<div style="margin-top:6px"><a href="${escapeHtml(project.url)}" style="color:#1d4ed8">Deschide lucrarea</a></div>`,
                '</div>',
            ].join('');
        })
        .join('');

    return [
        '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#111827;max-width:560px">',
        `<p>Bună, ${escapeHtml(parentFirstName)}!</p>`,
        `<p>${escapeHtml(intro)}</p>`,
        items,
        '<p style="color:#6b7280;font-size:13px">Linkurile cer autentificare, ca lucrarea copilului să nu se deschidă pentru oricine primește mesajul mai departe.</p>',
        `<p><a href="${escapeHtml(galleryUrl)}" style="color:#1d4ed8">Toate proiectele copiilor tăi</a></p>`,
        `<p style="white-space:pre-line">${escapeHtml(SIGNATURE)}</p>`,
        '</div>',
    ].join('');
}

/**
 * The internal message a parent's "this does not look like my child's work" produces. E14/S7.
 *
 * It goes to the office, not back to the family, and it deliberately does not offer the parent a
 * way to delete anything: the authorization matrix enumerates what a parent may write, and a parent
 * deleting a `Project` would need a new exception in exactly the list that keeps such things
 * deliberate.
 */
export function composeProjectReport(
    project: { id: number; title: string; childName: string },
    reportedBy: string,
    note: string | null,
    adminUrl: string,
): ComposedMail {
    const bodyText = [
        `${reportedBy} a semnalat o problemă la un document trimis.`,
        '',
        `Document: ${project.title} (#${project.id})`,
        `Atribuit lui: ${project.childName}`,
        ...(note ? ['', `Ce spune părintele: ${note}`] : []),
        '',
        'Ecranul de proiecte:',
        adminUrl,
        '',
        'Dacă documentul chiar a plecat greșit, sună familia. Nu trimite un al doilea email de corectare:',
        'un mesaj care spune „ignorați poza primită" atrage atenția asupra ei mai mult decât un telefon.',
        '',
        'Mesaj automat.',
    ].join('\n');

    return { subject: `Sesizare pe un proiect: ${project.title}`, bodyText };
}

function uniqueChildNames(projects: DeliveredProject[]): string[] {
    return [...new Set(projects.map((project) => project.childFirstName))];
}

function joinNames(names: string[]): string {
    if (names.length <= 1) return names[0] ?? '';
    return `${names.slice(0, -1).join(', ')} și ${names[names.length - 1]}`;
}

/** The title comes off a file name from a network share, so it is not trusted into HTML. */
function escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
