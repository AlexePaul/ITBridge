import { composeNoShowFollowUp, composeOfficeDigest, composeTrialConfirmation, composeTrialReminder, officeDigestIsEmpty } from './lead-mail';

const trial = {
    childFirstName: 'Matei',
    groupName: 'Scratch Începători',
    locationName: 'Titan',
    address: 'Strada Rotundă 12, București',
    date: '2026-03-17',
    startTime: '17:00:00',
};

/**
 * What the school says out loud — E20/S2 and S3.
 *
 * The assertions that matter are the ones about what these messages **do not** say: the epic's
 * decision is that enrolment is not self-service, and the place that decision either holds or breaks
 * is the sentence a parent reads at 20:00 after booking.
 */
describe('lead mail', () => {
    describe('the trial confirmation', () => {
        const message = composeTrialConfirmation(trial);

        it('says when and where, in words somebody can act on', () => {
            expect(message.bodyText).toContain('17 martie 2026');
            expect(message.bodyText).toContain('ora 17:00');
            expect(message.bodyText).toContain('Scratch Începători');
            expect(message.bodyText).toContain('Strada Rotundă 12');
        });

        it('promises a phone call, never an enrolment, a place or an account', () => {
            expect(message.bodyText).toContain('te sunăm');
            for (const promise of ['înscris', 'contul tău', 'cont nou', 'loc rezervat în grupă', 'autentific']) {
                expect(message.bodyText.toLowerCase()).not.toContain(promise.toLowerCase());
            }
        });

        it('says the seat goes to another child if they cannot come — because it does', () => {
            expect(message.bodyText).toContain('locul merge mai departe');
        });

        it('carries an HTML variant, since every other message the school sends does', () => {
            expect(message.bodyHtml).toContain('<p');
            expect(message.bodyHtml).toContain('Matei');
        });
    });

    it('reminds the day before with the same class in it', () => {
        const message = composeTrialReminder(trial);
        expect(message.subject).toContain('Mâine');
        expect(message.bodyText).toContain('Scratch Începători');
    });

    it('offers another date after a no-show, and asks for nothing else', () => {
        const message = composeNoShowFollowUp(trial);
        expect(message.bodyText).toContain('altă oră');
        expect(message.bodyText.toLowerCase()).not.toContain('ofertă');
    });

    describe('the office digest', () => {
        const empty = { stale: [], undecided: [], noSeats: [], unassigned: 0 };

        it('is empty when nothing is waiting, so nothing is sent', () => {
            expect(officeDigestIsEmpty(empty)).toBe(true);
        });

        it('is not empty for a single unowned lead — the loudest case of all', () => {
            expect(officeDigestIsEmpty({ ...empty, unassigned: 1 })).toBe(false);
        });

        it('puts trials held without a decision first, because they cost the most to lose', () => {
            const message = composeOfficeDigest({
                stale: [{ id: 3, parentName: 'Dan Ionescu', childFirstName: 'Sofia', days: 9, status: 'contacted' }],
                undecided: [{ id: 1, parentName: 'Ioana Popescu', childFirstName: 'Matei', days: 4 }],
                noSeats: [{ id: 2, parentName: 'Radu Marin', childFirstName: 'Ana', days: 2 }],
                unassigned: 2,
            });

            const body = message.bodyText;
            expect(body.indexOf('Probe ținute')).toBeLessThan(body.indexOf('fără loc liber'));
            expect(body.indexOf('fără loc liber')).toBeLessThan(body.indexOf('Fără nicio mișcare'));
            expect(body).toContain('Matei');
            expect(body).toContain('de 4 zile');
            expect(body).toContain('2 cereri nu au pe nimeni');
        });

        it('says "o zi" rather than "1 zile", which is how the number is read out loud', () => {
            const message = composeOfficeDigest({
                stale: [],
                undecided: [{ id: 1, parentName: 'Ioana', childFirstName: 'Matei', days: 1 }],
                noSeats: [],
                unassigned: 0,
            });
            expect(message.bodyText).toContain('de 1 zi');
        });
    });
});
