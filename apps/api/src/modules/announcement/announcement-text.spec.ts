import { childNamesIn, composeAnnouncement } from './announcement-text';

/**
 * The two halves of an announcement's text — E17/S7.
 *
 * The composer, because the greeting and the signature are the school's voice and the admin only
 * writes the middle; and the name check, because it is the mechanical form of the one rule E17
 * states absolutely: an announcement addresses a room, never a child.
 */
describe('announcement text', () => {
    describe('composing one recipient copy', () => {
        it('greets the parent, keeps the words, and signs off', () => {
            const mail = composeAnnouncement('Ana', 'Sâmbătă e zi liberă', 'Sâmbătă nu se țin cursuri.');

            expect(mail.bodyText.startsWith('Bună, Ana!')).toBe(true);
            expect(mail.bodyText).toContain('Sâmbătă nu se țin cursuri.');
            expect(mail.bodyText).toContain('Echipa IT Bridge School');
        });

        it('turns blank lines into paragraphs in the HTML variant', () => {
            const mail = composeAnnouncement('Ana', 'Titlu', 'Primul paragraf.\n\nAl doilea paragraf.');

            // Greeting plus two paragraphs; the signature is part of the frame, not a paragraph.
            expect(mail.bodyHtml.match(/<p style=/g)).toHaveLength(4);
            expect(mail.bodyHtml).toContain('Primul paragraf.');
            expect(mail.bodyHtml).toContain('Al doilea paragraf.');
        });

        it('escapes what the admin typed before it lands inside the HTML frame', () => {
            const mail = composeAnnouncement('Ana', 'Titlu', 'Scrieți la <office@exemplu.ro> & vă răspundem.');

            expect(mail.bodyHtml).toContain('&lt;office@exemplu.ro&gt; &amp; vă răspundem');
            // The text variant keeps it whole: it is prose there, not markup.
            expect(mail.bodyText).toContain('<office@exemplu.ro> & vă răspundem');
        });

        it('leaves double braces alone — an announcement is prose, not a template', () => {
            const mail = composeAnnouncement('Ana', 'Titlu', 'Ora începe la {{ora}}.');

            expect(mail.bodyText).toContain('{{ora}}');
        });
    });

    describe('the child-name check', () => {
        const names = ['Maria', 'Ștefan', 'Ana', 'Ilie'];

        it('finds a child named in the body', () => {
            expect(childNamesIn('Îl felicităm pe Ștefan pentru proiect.', names)).toEqual(['Ștefan']);
        });

        it('ignores diacritics and case, because a reader would', () => {
            expect(childNamesIn('felicitari lui STEFAN', names)).toEqual(['Ștefan']);
        });

        it('finds a name in the subject too — a leak in the subject line is the one everybody sees', () => {
            expect(childNamesIn('Despre Maria\nDetalii în mesaj.', names)).toEqual(['Maria']);
        });

        it('does not fire on a name that is only part of a longer word', () => {
            // "Ilie" inside "Iliescu" is not a child being named.
            expect(childNamesIn('Strada Iliescu 4, lângă Marianei.', names)).toEqual([]);
        });

        it('reports each name once, however often it appears', () => {
            expect(childNamesIn('Maria și Maria.', names)).toEqual(['Maria']);
        });

        it('says nothing about an announcement that names nobody', () => {
            expect(childNamesIn('Sâmbătă nu se țin cursuri. Orele se reiau luni.', names)).toEqual([]);
        });

        it('skips names too short to be anything but noise', () => {
            // A check that fires on every "la" and "de" is a checkbox people learn to tick.
            expect(childNamesIn('Ne vedem la ora obișnuită.', ['La', 'Io'])).toEqual([]);
        });
    });
});
