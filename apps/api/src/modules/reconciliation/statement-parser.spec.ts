import { fingerprintLines, parseAmount, parseStatement, parseStatementDate, StatementFormatError } from './statement-parser';

/**
 * The bank statement reader — E16/S8. The exports here are shaped like the ones Romanian banks
 * produce — a preamble above the header, `;` with a decimal comma, a credit and a debit column —
 * and like the generic English CSV. No real statement was available when this was written; the
 * first one the school exports is the real test, and its shape belongs here once it has been seen.
 */
describe('parseStatement', () => {
    it('finds the header under a preamble and keeps only the money coming in', () => {
        const parsed = parseStatement(
            [
                'Extras de cont;;;;',
                'Titular:;ITBRIDGE SCHOOL SRL;;;',
                'IBAN:;RO49AAAA1B31007593840000;;;',
                ';;;;',
                'Data tranzactie;Descriere;Debit;Credit;Sold',
                '05.11.2026;"Incasare OP - POPESCU ANA - plata ITB 0041";;350,00;1.350,00',
                '05.11.2026;Plata furnizor;120,50;;1.229,50',
                '06.11.2026;"IONESCU MIHAI; factura ITB-42";;1.200,00;2.429,50',
                'Total rulaje;;120,50;1.550,00;',
            ].join('\r\n'),
        );

        expect(parsed.lines).toEqual([
            { row: 6, bookedOn: '2026-11-05', amount: 350, description: 'Incasare OP - POPESCU ANA - plata ITB 0041', counterparty: null, reference: null },
            { row: 8, bookedOn: '2026-11-06', amount: 1200, description: 'IONESCU MIHAI; factura ITB-42', counterparty: null, reference: null },
        ]);
        expect(parsed.debits).toBe(1);
        // A total row is reported, never swallowed: a statement that loses a line is worse than one that complains.
        expect(parsed.unreadable).toEqual([{ row: 9, problem: 'unreadable_date', cell: 'Total rulaje' }]);
        expect(parsed.columns).toMatchObject({ date: 'Data tranzactie', amount: 'Credit', description: 'Descriere' });
    });

    it('names why a row was not read, as a code the page can say in Romanian', () => {
        const parsed = parseStatement(['Data;Credit;Detalii', ';1.550,00;Sold final', '05.11.2026;;OP fara suma', '05.11.2026;350,00;ITB 41'].join('\n'));

        expect(parsed.unreadable).toEqual([
            { row: 2, problem: 'no_date', cell: null },
            { row: 3, problem: 'no_amount', cell: '05.11.2026' },
        ]);
        expect(parsed.lines).toHaveLength(1);
    });

    it('reads a signed amount, English headers and ISO dates', () => {
        const parsed = parseStatement(
            [
                'Booking date,Amount,Counterparty,Description,Reference',
                '2026-11-05,350.00,Popescu Ana,ITB0041,TRX1',
                '2026-11-05,-50.00,Shop,Card payment,TRX2',
            ].join('\n'),
        );

        expect(parsed.lines).toEqual([{ row: 2, bookedOn: '2026-11-05', amount: 350, description: 'ITB0041', counterparty: 'Popescu Ana', reference: 'TRX1' }]);
        expect(parsed.debits).toBe(1);
    });

    it('reads an amount with a debit/credit column beside it', () => {
        const parsed = parseStatement(['Data;Sumă (RON);Tip;Detalii', '05/11/2026;350,00;C;OP ITB 41', '06/11/2026;80,00;D;Comision'].join('\n'));

        expect(parsed.lines).toEqual([expect.objectContaining({ bookedOn: '2026-11-05', amount: 350, description: 'OP ITB 41' })]);
        expect(parsed.debits).toBe(1);
    });

    it('keeps a quoted line break inside its cell, and the row numbers true', () => {
        const parsed = parseStatement(['Data;Credit;Detalii', '05.11.2026;350,00;"plata', 'ITB 41"', '06.11.2026;175,00;ITB 42'].join('\n'));

        expect(parsed.lines.map((line) => [line.row, line.description])).toEqual([
            [2, 'plata\nITB 41'],
            [4, 'ITB 42'],
        ]);
    });

    it('refuses a file with no recognisable header, naming what it looked for', () => {
        expect(() => parseStatement('a;b;c\n1;2;3')).toThrow(StatementFormatError);
    });
});

describe('parseAmount', () => {
    it('reads both conventions, and figures with a currency or a sign', () => {
        expect(parseAmount('1.234,56')).toBe(1234.56);
        expect(parseAmount('1,234.56')).toBe(1234.56);
        expect(parseAmount('350,00')).toBe(350);
        expect(parseAmount('350.00')).toBe(350);
        expect(parseAmount('350,00 RON')).toBe(350);
        expect(parseAmount('-120,50')).toBe(-120.5);
        expect(parseAmount('(50,00)')).toBe(-50);
        expect(parseAmount('1 234,50')).toBe(1234.5);
    });

    // Bank figures carry bani, so three digits after a lone separator are thousands.
    it('reads a lone separator before three digits as thousands', () => {
        expect(parseAmount('1.234')).toBe(1234);
        expect(parseAmount('1,234')).toBe(1234);
    });

    it('answers nothing for what is not a figure', () => {
        expect(parseAmount('')).toBeNull();
        expect(parseAmount('abc')).toBeNull();
    });
});

describe('parseStatementDate', () => {
    it('reads the shapes the exports use', () => {
        expect(parseStatementDate('05.11.2026')).toBe('2026-11-05');
        expect(parseStatementDate('2026-11-05')).toBe('2026-11-05');
        expect(parseStatementDate('5/11/26')).toBe('2026-11-05');
        expect(parseStatementDate('05.11.2026 14:22')).toBe('2026-11-05');
    });

    it('refuses a day that is not real', () => {
        expect(parseStatementDate('31.02.2026')).toBeNull();
        expect(parseStatementDate('Total')).toBeNull();
    });
});

describe('fingerprintLines', () => {
    const line = { row: 2, bookedOn: '2026-11-05', amount: 350, description: 'ITB 41', counterparty: 'Popescu Ana', reference: null };

    it('gives the same line the same identity, wherever it sits in the file', () => {
        expect(fingerprintLines([line])[0]).toBe(fingerprintLines([{ ...line, row: 40 }])[0]);
    });

    // Two identical transfers on one day are two payments; the second must not read as a duplicate.
    it('tells identical lines in one file apart by their order', () => {
        const [first, second] = fingerprintLines([line, { ...line, row: 3 }]);
        expect(first).not.toBe(second);
        expect(fingerprintLines([line])[0]).toBe(first);
    });

    it('ignores spacing and case in the details, which exports rewrite freely', () => {
        expect(fingerprintLines([{ ...line, description: '  itb   41 ' }])[0]).toBe(fingerprintLines([line])[0]);
    });
});
