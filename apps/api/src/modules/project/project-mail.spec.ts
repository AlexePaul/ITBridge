import { composeProjectDelivery, composeProjectReport, DeliveredProject } from './project-mail';

/**
 * What a parent actually reads. E14/S4.
 *
 * Asserted without a queue or a database behind it, which is the reason these are plain functions —
 * the same split as `account-mail.ts` and E12's daily reminder.
 */

function project(overrides: Partial<DeliveredProject> = {}): DeliveredProject {
    return {
        childFirstName: 'Andrei',
        title: 'Robotul care evită obstacole',
        url: 'https://itbridgeschool.com/files/8f0b',
        ...overrides,
    };
}

describe('composeProjectDelivery', () => {
    it('names the child and links into the portal, never to storage', () => {
        const mail = composeProjectDelivery('Maria', [project()], 'https://itbridgeschool.com/user/proiecte');

        expect(mail.subject).toContain('Andrei');
        expect(mail.bodyText).toContain('https://itbridgeschool.com/files/8f0b');
        // The one thing that must never appear: a storage URL. E14 attaches the thumbnail precisely
        // so that no long-lived link to a child's work exists anywhere outside the portal.
        expect(mail.bodyText).not.toContain('amazonaws');
        expect(mail.bodyText).not.toContain('X-Amz-Signature');
    });

    it('covers two children of the same parent in one message', () => {
        // E17/S6's anti-burst rule. Being triggered by a human pressing a button is not a loophole
        // through it: a parent with two children in the same send gets one email, with both.
        const mail = composeProjectDelivery('Maria', [project(), project({ childFirstName: 'Ioana', title: 'Jocul cu labirint' })], 'https://x/gal');

        expect(mail.subject).toContain('Andrei');
        expect(mail.subject).toContain('Ioana');
        expect(mail.bodyText).toContain('Robotul care evită obstacole');
        expect(mail.bodyText).toContain('Jocul cu labirint');
    });

    it('references an attached thumbnail as cid, and only when there is one', () => {
        const withPicture = composeProjectDelivery('Maria', [project({ contentId: 'proiect-41' })], 'https://x/gal');
        const without = composeProjectDelivery('Maria', [project()], 'https://x/gal');

        expect(withPicture.bodyHtml).toContain('cid:proiect-41');
        // A `cid:` with no attachment behind it renders as a broken image, which is worse than a
        // line of text — so the reference is absent rather than dangling.
        expect(without.bodyHtml).not.toContain('cid:');
    });

    it('escapes a title that came off a network share', () => {
        // The title defaults to a file name, and the share is writable from every machine in the
        // school. An unescaped one would be markup in a parent's mail client.
        const mail = composeProjectDelivery('Maria', [project({ title: '<img src=x onerror=alert(1)>' })], 'https://x/gal');

        expect(mail.bodyHtml).not.toContain('<img src=x');
        expect(mail.bodyHtml).toContain('&lt;img src=x');
    });

    it('says nothing about what was learned, because there is no curriculum to say it from', () => {
        // E10 is out of MVP. The absence is a decision: the email works with a picture, a title and a
        // way in, and the line appears when modules exist.
        const mail = composeProjectDelivery('Maria', [project()], 'https://x/gal');

        expect(mail.bodyText).not.toContain('Ce s-a învățat');
    });

    it("tells the parent how to say a document is not their child's", () => {
        const mail = composeProjectDelivery('Maria', [project()], 'https://x/gal');

        expect(mail.bodyText).toContain('spune-ne');
    });
});

describe('composeProjectReport', () => {
    it('goes to the school with what the parent said, and tells whoever reads it to phone', () => {
        const mail = composeProjectReport({ id: 41, title: 'Robotul', childName: 'Andrei Popescu' }, 'Maria Popescu', 'Pare al altui copil', 'https://x/admin');

        expect(mail.bodyText).toContain('Maria Popescu');
        expect(mail.bodyText).toContain('Pare al altui copil');
        // Not a second email of correction: a message saying "ignore the picture you received" draws
        // more attention to it than a phone call does.
        expect(mail.bodyText).toContain('sună familia');
    });

    it('works without a note, because the note is optional', () => {
        const mail = composeProjectReport({ id: 41, title: 'Robotul', childName: 'Andrei Popescu' }, 'Maria Popescu', null, 'https://x/admin');

        expect(mail.bodyText).toContain('#41');
    });
});
