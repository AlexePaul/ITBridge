/**
 * Who the school is on paper, and where a bank transfer goes — terms §11.3: „Plata se face prin
 * transfer bancar sau în numerar la școală".
 *
 * Read from the environment, because these are the school's own facts, and the last thing entered
 * before launch (docs/lansare-platforma.md) — like the SmartBill account, they are not the platform's
 * to invent. Every field is optional: stage has no bank account, and a screen or an email with nothing
 * configured says to pay at the office or to ask, rather than printing a placeholder IBAN a family
 * might send money to.
 *
 * No `src/…` imports here: `config/env.validation.ts` checks the IBAN at startup and is loaded by the
 * TypeORM CLI without `tsconfig-paths` (CLAUDE.md, Convenții).
 */
export interface SchoolIdentity {
    /** `SCHOOL_LEGAL_NAME` — the company, as registered: the beneficiary of a transfer. */
    legalName: string | null;
    /** `SCHOOL_CUI` — the tax identification code (CUI/CIF). */
    taxId: string | null;
    /** `SCHOOL_REG_COM` — the trade register number, `J40/…`. */
    registration: string | null;
    /** `SCHOOL_SEAT` — the registered office, which can differ from the teaching addresses. */
    seat: string | null;
    /** `SCHOOL_IBAN` — normalised: no spaces, upper case. Checked at startup (`ibanProblem`). */
    iban: string | null;
    /** `SCHOOL_BANK` — the bank's name, for a family typing the transfer by hand. */
    bank: string | null;
}

/** Where a transfer goes. Only when both halves are known: an IBAN with no beneficiary is not an instruction. */
export interface TransferDetails {
    beneficiary: string;
    /** Grouped by four, as a bank prints it and a person copies it. */
    iban: string;
    bank: string | null;
}

const clean = (value: string | undefined): string | null => {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
};

export function normalizeIban(value: string | undefined): string | null {
    const compact = value?.replace(/\s+/g, '').toUpperCase();
    return compact ? compact : null;
}

export function schoolIdentity(): SchoolIdentity {
    return {
        legalName: clean(process.env.SCHOOL_LEGAL_NAME),
        taxId: clean(process.env.SCHOOL_CUI),
        registration: clean(process.env.SCHOOL_REG_COM),
        seat: clean(process.env.SCHOOL_SEAT),
        iban: normalizeIban(process.env.SCHOOL_IBAN),
        bank: clean(process.env.SCHOOL_BANK),
    };
}

export function formatIban(iban: string): string {
    return iban.replace(/(.{4})(?=.)/g, '$1 ');
}

export function transferDetails(identity: SchoolIdentity = schoolIdentity()): TransferDetails | null {
    if (!identity.legalName || !identity.iban) return null;
    return { beneficiary: identity.legalName, iban: formatIban(identity.iban), bank: identity.bank };
}

/**
 * The sentence a family reads about paying — in the invoice email, where a template variable has to
 * be one piece of text. With the account known, the transfer details and the reference to write; if
 * not, the office, which is always true.
 */
export function paymentInstructions(details: TransferDetails | null, reference: string): string {
    if (!details) {
        return `Poți plăti în numerar, la școală, sau prin transfer bancar — datele contului ni le ceri la birou; la detaliile plății scrie ${reference}.`;
    }
    const bank = details.bank ? `, ${details.bank}` : '';
    return `Poți plăti în numerar, la școală, sau prin transfer bancar în contul ${details.iban}${bank}, beneficiar ${details.beneficiary}; la detaliile plății scrie ${reference}.`;
}

/**
 * What is wrong with an IBAN, or `null` — ISO 13616: two letters, two check digits, then the account,
 * and the whole moved and read as a number leaves 1 modulo 97. A mistyped digit in the one number
 * families send money to is worth refusing to start over: the next place it would be noticed is a
 * family's bank, with the money gone somewhere else. A Romanian IBAN is also exactly 24 characters.
 */
export function ibanProblem(value: string | undefined): string | null {
    const iban = normalizeIban(value);
    if (!iban) return null;
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return `SCHOOL_IBAN (${iban}) is not shaped like an IBAN`;
    if (iban.startsWith('RO') && iban.length !== 24) return `SCHOOL_IBAN (${iban}) has ${iban.length} characters; a Romanian IBAN has 24`;
    const moved = iban.slice(4) + iban.slice(0, 4);
    const digits = moved.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));
    let remainder = 0;
    for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
    return remainder === 1 ? null : `SCHOOL_IBAN (${iban}) fails its check digits; it is mistyped`;
}
