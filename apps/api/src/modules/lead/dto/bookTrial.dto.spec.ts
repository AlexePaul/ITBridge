import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BookTrialDto } from './bookTrial.dto';

/**
 * The booking form is public and the page shows the server's sentence when a field is refused, so
 * every refusal a parent can cause has to be one a parent can read.
 */
describe('BookTrialDto', () => {
    const valid = {
        parentName: 'Ioana Popescu',
        parentEmail: 'ioana@example.com',
        childFirstName: 'Matei',
        childLastName: 'Popescu',
        childBirthDate: '2017-05-10',
    };

    const messagesFor = async (overrides: Record<string, unknown>) => {
        const errors = await validate(plainToInstance(BookTrialDto, { ...valid, ...overrides }));
        return errors.flatMap((error) => Object.values(error.constraints ?? {}));
    };

    it('accepts the form as a parent fills it in', async () => {
        expect(await messagesFor({})).toEqual([]);
    });

    it.each([
        [{ parentEmail: 'nu-e-email-valid' }, 'Adresa de email nu pare validă'],
        [{ parentPhone: '12' }, 'Numărul de telefon nu pare valid'],
        [{ parentName: 'I' }, 'Numele tău trebuie să aibă între 2 și 160 de caractere'],
        [{ childFirstName: 'x'.repeat(101) }, 'Prenumele copilului trebuie să aibă între 2 și 100 de caractere'],
        [{ childLastName: 'P' }, 'Numele de familie trebuie să aibă între 2 și 100 de caractere'],
        [{ childBirthDate: '10.05.2017' }, 'Data nașterii nu pare validă'],
        [{ experience: 'x'.repeat(2001) }, 'Răspunsul despre experiență e prea lung — cel mult 2000 de caractere'],
    ])('refuses %o in Romanian', async (overrides, message) => {
        expect(await messagesFor(overrides)).toContain(message);
    });

    it('stores the phone in one spelling', () => {
        expect(plainToInstance(BookTrialDto, { ...valid, parentPhone: '0712 345 678' }).parentPhone).toBe('+40712345678');
    });
});
