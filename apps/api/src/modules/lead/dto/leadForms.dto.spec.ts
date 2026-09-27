import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateLeadDto } from './createLead.dto';
import { UpdateLeadDto } from './updateLead.dto';

/**
 * The office's two lead forms — „Cerere nouă" and the lead's file. Both print the server's sentence
 * under the form when it refuses a field (`apiErrorMessage` joins the validator's details), so every
 * refusal a person can cause by typing has to be one they can read: „Cerere nouă" answered a
 * mistyped number with "parentPhone must be a valid phone number" (QA of 27 September 2026).
 */
describe('the lead forms', () => {
    const messagesOf = async (dto: object) => (await validate(dto)).flatMap((error) => Object.values(error.constraints ?? {}));
    /** Every class-validator default says what a field "must" or "should" be. */
    const english = /\b(must|should)\b/;

    describe('CreateLeadDto', () => {
        const valid = {
            parentName: 'Ioana Popescu',
            parentPhone: '0712345678',
            childFirstName: 'Matei',
            childLastName: 'Popescu',
            childBirthDate: '2017-05-10',
            source: 'phone',
        };
        const messagesFor = (overrides: Record<string, unknown>) => messagesOf(plainToInstance(CreateLeadDto, { ...valid, ...overrides }));

        it('accepts the form as the office fills it in', async () => {
            expect(await messagesFor({})).toEqual([]);
        });

        it.each([
            [{ parentPhone: '12345' }, 'Numărul de telefon nu pare valid'],
            [{ parentEmail: 'nu-e-email-valid' }, 'Adresa de email nu pare validă'],
            [{ parentName: 'I' }, 'Numele părintelui trebuie să aibă între 2 și 160 de caractere'],
            [{ parentName: undefined }, 'Scrie numele părintelui'],
            [{ childFirstName: 'x'.repeat(101) }, 'Prenumele copilului trebuie să aibă între 2 și 100 de caractere'],
            [{ childLastName: 'P' }, 'Numele copilului trebuie să aibă între 2 și 100 de caractere'],
            [{ childBirthDate: '10.05.2017' }, 'Data nașterii nu pare validă'],
            [{ experience: 'x'.repeat(2001) }, 'Ce a mai făcut copilul e prea lung — cel mult 2000 de caractere'],
            [{ notes: 'x'.repeat(4001) }, 'Notele sunt prea lungi — cel mult 4000 de caractere'],
            [{ nextActionAt: 'mâine' }, 'Ziua pasului următor nu pare validă'],
            [{ source: 'fax' }, 'Alege cum a venit cererea'],
            [{ channel: 'porumbel' }, 'Alege de unde a auzit familia de școală'],
        ])('refuses %o in Romanian', async (overrides, message) => {
            expect(await messagesFor(overrides)).toContain(message);
        });

        it('says nothing in English about a field the office types', async () => {
            const typed = {
                parentName: 'I',
                parentPhone: '12345',
                parentEmail: 'x',
                childFirstName: 'x',
                childLastName: 'x',
                childBirthDate: 'ieri',
                experience: 'x'.repeat(2001),
                notes: 'x'.repeat(4001),
                nextActionAt: 'mâine',
            };
            const messages = await messagesFor(typed);

            expect(messages.length).toBeGreaterThan(0);
            expect(messages.filter((message) => english.test(message))).toEqual([]);
        });

        it('still stores the phone in one spelling', () => {
            expect(plainToInstance(CreateLeadDto, { ...valid, parentPhone: '0712 345 678' }).parentPhone).toBe('+40712345678');
        });
    });

    describe('UpdateLeadDto', () => {
        const messagesFor = (fields: Record<string, unknown>) => messagesOf(plainToInstance(UpdateLeadDto, fields));

        it.each([
            [{ parentPhone: '12345' }, 'Numărul de telefon nu pare valid'],
            [{ parentEmail: 'nu-e-email-valid' }, 'Adresa de email nu pare validă'],
            [{ notes: 'x'.repeat(4001) }, 'Notele sunt prea lungi — cel mult 4000 de caractere'],
            [{ nextActionAt: 'mâine' }, 'Ziua pasului următor nu pare validă'],
            [{ channel: 'porumbel' }, 'Alege de unde a auzit familia de școală'],
        ])('refuses %o in the same words as the new-request form', async (fields, message) => {
            expect(await messagesFor(fields)).toContain(message);
        });
    });
});
