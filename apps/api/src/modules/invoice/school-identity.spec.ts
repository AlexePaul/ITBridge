import { formatIban, ibanProblem, paymentInstructions, schoolIdentity, transferDetails, type SchoolIdentity } from './school-identity';
import { supplierLines } from './pdf.service';
import { officeAddress } from 'src/modules/mail/office-address';

/** The IBAN banks print as their example: valid check digits, and nobody's money. */
const EXAMPLE_IBAN = 'RO49AAAA1B31007593840000';

const identity = (fields: Partial<SchoolIdentity> = {}): SchoolIdentity => ({
    legalName: null,
    taxId: null,
    registration: null,
    seat: null,
    iban: null,
    bank: null,
    ...fields,
});

describe('the school on paper', () => {
    describe('ibanProblem', () => {
        it('takes a valid IBAN however it was typed', () => {
            expect(ibanProblem(EXAMPLE_IBAN)).toBeNull();
            expect(ibanProblem('ro49 aaaa 1b31 0075 9384 0000')).toBeNull();
            expect(ibanProblem('DE89370400440532013000')).toBeNull();
            expect(ibanProblem(undefined)).toBeNull();
        });

        /** One wrong digit in the number families send money to is refused before anyone reads it. */
        it('refuses a mistyped digit by its check digits', () => {
            expect(ibanProblem('RO49AAAA1B31007593840001')).toContain('check digits');
        });

        it('refuses a Romanian IBAN of the wrong length, and text that is not an IBAN', () => {
            expect(ibanProblem('RO49AAAA1B3100759384000')).toContain('24');
            expect(ibanProblem('0712 345 678')).toContain('not shaped like an IBAN');
        });
    });

    describe('transferDetails', () => {
        it('needs both the beneficiary and the account', () => {
            expect(transferDetails(identity({ iban: EXAMPLE_IBAN }))).toBeNull();
            expect(transferDetails(identity({ legalName: 'IT Bridge School SRL' }))).toBeNull();
        });

        it('groups the IBAN by four, as a bank prints it', () => {
            expect(transferDetails(identity({ legalName: 'IT Bridge School SRL', iban: EXAMPLE_IBAN, bank: 'Banca Exemplu' }))).toEqual({
                beneficiary: 'IT Bridge School SRL',
                iban: 'RO49 AAAA 1B31 0075 9384 0000',
                bank: 'Banca Exemplu',
            });
            expect(formatIban('RO49AAAA')).toBe('RO49 AAAA');
        });

        it('reads the settings from the environment, trimmed and normalised', () => {
            const before = { ...process.env };
            process.env.SCHOOL_LEGAL_NAME = ' IT Bridge School SRL ';
            process.env.SCHOOL_IBAN = 'ro49 aaaa 1b31 0075 9384 0000';
            process.env.SCHOOL_BANK = '';
            try {
                expect(schoolIdentity()).toMatchObject({ legalName: 'IT Bridge School SRL', iban: EXAMPLE_IBAN, bank: null });
            } finally {
                process.env = before;
            }
        });
    });

    describe('paymentInstructions', () => {
        it('names the account and the reference to write when the account is known', () => {
            const sentence = paymentInstructions(
                { beneficiary: 'IT Bridge School SRL', iban: 'RO49 AAAA 1B31 0075 9384 0000', bank: 'Banca Exemplu' },
                'factura ITB 0042',
            );

            expect(sentence).toContain('RO49 AAAA 1B31 0075 9384 0000, Banca Exemplu, beneficiar IT Bridge School SRL');
            expect(sentence).toContain('scrie factura ITB 0042');
        });

        /** Never a placeholder account: a family might send money to it. */
        it('sends the family to the portal or the office when it is not', () => {
            expect(paymentInstructions(null, 'factura nr. 55')).toContain('ni le ceri la birou');
        });
    });

    describe('the PDF header', () => {
        it('prints the company as registered, in the order an invoice does', () => {
            expect(
                supplierLines(
                    identity({
                        legalName: 'IT Bridge School SRL',
                        taxId: 'RO12345678',
                        registration: 'J40/1234/2024',
                        seat: 'Str. Exemplu 1, București',
                        iban: EXAMPLE_IBAN,
                        bank: 'Banca Exemplu',
                    }),
                ),
            ).toEqual([
                'IT Bridge School SRL',
                'CUI RO12345678',
                'Reg. Com. J40/1234/2024',
                'Str. Exemplu 1, București',
                'IBAN RO49 AAAA 1B31 0075 9384 0000, Banca Exemplu',
            ]);
        });

        /** What it printed before the settings existed — true, and the most the platform knows. */
        it('falls back to the name, the office and the city with nothing set', () => {
            expect(supplierLines(identity())).toEqual(['IT Bridge School', officeAddress(), 'București']);
        });
    });
});
