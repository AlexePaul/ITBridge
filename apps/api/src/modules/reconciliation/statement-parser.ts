/**
 * A bank statement, read from the CSV a Romanian bank exports — E16/S8.
 *
 * **Written against the shape of the exports, not against one bank.** Which bank the school uses is
 * not written down anywhere in this repository, and the exports differ in all the ways that matter:
 * the delimiter (`;` where the decimal separator is a comma, `,` otherwise, a tab when copied out
 * of a spreadsheet), a preamble of account details above the header, the header's wording, one
 * signed amount column or a credit and a debit column, `1.234,56` or `1,234.56`, `05.11.2026` or
 * `2026-11-05`. So the reader finds the header by the words in it, and the columns by what they are
 * called — in Romanian or English, with or without diacritics — and reads the figures by their
 * shape. Only incoming money is kept: an outgoing row is not a family paying.
 *
 * A row it cannot read is reported with its line number, never skipped in silence: a statement
 * that loses a payment on the way in is worse than one that refuses to load.
 */

import { createHash } from 'node:crypto';

export interface ParsedStatementLine {
    /** The line in the file, 1-based — what the screen names when it reports a problem. */
    row: number;
    /** `YYYY-MM-DD`. */
    bookedOn: string;
    /** Always positive: only credits are kept. */
    amount: number;
    description: string;
    counterparty: string | null;
    reference: string | null;
}

export interface StatementParse {
    lines: ParsedStatementLine[];
    /** Outgoing rows, skipped. Counted so the screen can say nothing was lost, only set aside. */
    debits: number;
    unreadable: { row: number; reason: string }[];
    /** The header cells the reader used, as written in the file, so a wrong pick can be seen. */
    columns: { date: string; amount: string; description: string | null; counterparty: string | null; reference: string | null };
}

/** A file with no recognisable header. The message names what was looked for. */
export class StatementFormatError extends Error {}

type Role = 'date' | 'credit' | 'debit' | 'amount' | 'type' | 'description' | 'counterparty' | 'reference';

/**
 * What each column is called, normalised (lower case, no diacritics, punctuation as spaces). Order
 * matters inside a role: the first name found wins, so a booking date is preferred to a value date.
 */
const HEADER_NAMES: Record<Role, string[]> = {
    date: [
        'data tranzactiei',
        'data tranzactie',
        'data operatiunii',
        'data operatiei',
        'data inregistrarii',
        'data contabila',
        'data procesarii',
        'booking date',
        'transaction date',
        'data',
        'date',
        'data valutei',
        'data valuta',
        'value date',
    ],
    credit: ['credit', 'suma credit', 'sume creditate', 'suma creditata', 'incasari', 'intrari', 'credit amount'],
    debit: ['debit', 'suma debit', 'sume debitate', 'suma debitata', 'plati', 'iesiri', 'debit amount'],
    amount: ['suma', 'valoare', 'amount', 'suma tranzactiei', 'suma tranzactie', 'valoare tranzactie', 'suma operatiunii'],
    type: ['tip', 'tip tranzactie', 'tip operatiune', 'debit credit', 'credit debit', 'd c', 'c d', 'sens'],
    description: [
        'detalii',
        'detalii tranzactie',
        'detalii tranzactii',
        'descriere',
        'descriere tranzactie',
        'explicatii',
        'explicatie',
        'informatii',
        'mentiuni',
        'observatii',
        'description',
        'details',
        'narrative',
    ],
    counterparty: [
        'nume ordonator',
        'ordonator',
        'nume platitor',
        'platitor',
        'beneficiar ordonator',
        'ordonator beneficiar',
        'nume contrapartida',
        'contrapartida',
        'partener',
        'counterparty',
        'nume',
        'titular',
    ],
    reference: [
        'referinta',
        'referinta tranzactie',
        'referinta tranzactiei',
        'nr referinta',
        'numar referinta',
        'id tranzactie',
        'numar tranzactie',
        'cod tranzactie',
        'reference',
        'transaction id',
    ],
};

const CREDIT_TYPES = new Set(['c', 'cr', 'credit', 'incasare', 'intrare', 'in']);
const DEBIT_TYPES = new Set(['d', 'db', 'dr', 'debit', 'plata', 'iesire', 'out']);

/** How far down the header may sit, under a preamble of account details. */
const HEADER_SEARCH_ROWS = 40;

export function parseStatement(content: string): StatementParse {
    const text = content.replace(/^\uFEFF/, '');
    const header = findHeader(text);
    if (!header) {
        throw new StatementFormatError(
            'No header row found: expected a date column and an amount (or credit) column among the first 40 rows, named in Romanian or English.',
        );
    }

    const { rows, delimiter, headerIndex, roles } = header;
    const cells = rows[headerIndex].cells;
    const column = (role: Role) => roles.get(role);
    const cellAt = (row: string[], role: Role): string => {
        const index = column(role);
        return index === undefined ? '' : (row[index] ?? '').trim();
    };

    const result: StatementParse = {
        lines: [],
        debits: 0,
        unreadable: [],
        columns: {
            date: cells[column('date') as number].trim(),
            amount: cells[(column('credit') ?? column('amount')) as number].trim(),
            description: column('description') !== undefined ? cells[column('description') as number].trim() : null,
            counterparty: column('counterparty') !== undefined ? cells[column('counterparty') as number].trim() : null,
            reference: column('reference') !== undefined ? cells[column('reference') as number].trim() : null,
        },
    };
    void delimiter;

    for (const { cells: row, line } of rows.slice(headerIndex + 1)) {
        if (row.every((cell) => cell.trim() === '')) continue;

        const dateCell = cellAt(row, 'date');
        const signed = readSignedAmount(row, cellAt);
        if (!dateCell && signed === null) continue; // a spacer, or a footer with nothing in it

        const bookedOn = parseStatementDate(dateCell);
        if (!bookedOn) {
            result.unreadable.push({ row: line, reason: dateCell ? `unreadable date "${dateCell}"` : 'no date — probably a total or a balance row' });
            continue;
        }
        if (signed === null) {
            result.unreadable.push({ row: line, reason: 'no amount could be read' });
            continue;
        }
        if (signed <= 0) {
            result.debits++;
            continue;
        }

        result.lines.push({
            row: line,
            bookedOn,
            amount: signed,
            description: cellAt(row, 'description'),
            counterparty: cellAt(row, 'counterparty') || null,
            reference: cellAt(row, 'reference') || null,
        });
    }

    return result;
}

/**
 * The row's money as a signed figure: positive in, negative out, `null` when nothing reads. Three
 * layouts: a credit and a debit column; one amount with a D/C column beside it; one signed amount.
 */
function readSignedAmount(row: string[], cellAt: (row: string[], role: Role) => string): number | null {
    const credit = parseAmount(cellAt(row, 'credit'));
    const debit = parseAmount(cellAt(row, 'debit'));
    if (credit !== null || debit !== null) {
        if (credit !== null && credit !== 0) return Math.abs(credit);
        if (debit !== null && debit !== 0) return -Math.abs(debit);
        return credit ?? debit;
    }

    const amount = parseAmount(cellAt(row, 'amount'));
    if (amount === null) return null;
    const type = normalizeHeader(cellAt(row, 'type'));
    if (CREDIT_TYPES.has(type)) return Math.abs(amount);
    if (DEBIT_TYPES.has(type)) return -Math.abs(amount);
    return amount;
}

/**
 * A money figure in either convention. With both separators the last one is the decimal point; with
 * one, it is a decimal point only when one or two digits follow it — bank figures carry bani, so
 * `1.234` and `1,234` are thousands.
 */
export function parseAmount(raw: string): number | null {
    let text = raw.replace(/\s|\u00A0/g, '').replace(/(ron|lei|eur)$/i, '');
    if (text === '') return null;
    let negative = false;
    if (/^\(.*\)$/.test(text)) {
        negative = true;
        text = text.slice(1, -1);
    }
    if (text.startsWith('-')) {
        negative = !negative;
        text = text.slice(1);
    } else if (text.startsWith('+')) {
        text = text.slice(1);
    }
    if (text.endsWith('-')) {
        negative = !negative;
        text = text.slice(0, -1);
    }
    if (!/^[\d.,]+$/.test(text)) return null;

    const lastComma = text.lastIndexOf(',');
    const lastDot = text.lastIndexOf('.');
    let normalized: string;
    if (lastComma !== -1 && lastDot !== -1) {
        const decimal = lastComma > lastDot ? ',' : '.';
        const thousands = decimal === ',' ? '.' : ',';
        normalized = text.split(thousands).join('').replace(decimal, '.');
    } else if (lastComma !== -1 || lastDot !== -1) {
        const separator = lastComma !== -1 ? ',' : '.';
        const parts = text.split(separator);
        const tail = parts[parts.length - 1];
        normalized = parts.length === 2 && tail.length <= 2 ? `${parts[0]}.${tail}` : parts.join('');
    } else {
        normalized = text;
    }
    const value = Number(normalized);
    if (!Number.isFinite(value)) return null;
    return negative ? -value : value;
}

/** A booking date in any of the shapes the exports use, as `YYYY-MM-DD`; `null` when it is not a real day. */
export function parseStatementDate(raw: string): string | null {
    const text = raw.trim().split(/[ T]/)[0];
    let year: number;
    let month: number;
    let day: number;
    let match = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(text);
    if (match) {
        [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
    } else {
        match = /^(\d{1,2})[-./](\d{1,2})[-./](\d{2}|\d{4})$/.exec(text);
        if (!match) return null;
        [day, month, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
        if (year < 100) year += 2000;
    }
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * A stable identity for each line, so the same statement imported twice — or two that overlap —
 * adds nothing the second time. The content, plus the line's place among lines identical to it in
 * the same file: two transfers of 350 lei from one parent on one day, with the same details, are
 * two payments, and a hash of the content alone would keep only the first.
 */
export function fingerprintLines(lines: ParsedStatementLine[]): string[] {
    const seen = new Map<string, number>();
    return lines.map((line) => {
        const content = [line.bookedOn, Math.round(line.amount * 100), line.reference ?? '', squash(line.description), squash(line.counterparty ?? '')].join(
            '|',
        );
        const occurrence = seen.get(content) ?? 0;
        seen.set(content, occurrence + 1);
        return createHash('sha256').update(`${content}|${occurrence}`).digest('hex');
    });
}

function squash(text: string): string {
    return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function normalizeHeader(cell: string): string {
    return cell
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\b(ron|lei|eur|usd)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

interface HeaderFound {
    rows: { cells: string[]; line: number }[];
    delimiter: string;
    headerIndex: number;
    roles: Map<Role, number>;
}

/**
 * The header is the first row, under whatever preamble, that names a date column and a money column
 * (a credit column, or an amount). Every delimiter is tried on it; the one that makes a header wins.
 */
function findHeader(text: string): HeaderFound | null {
    for (const delimiter of [';', ',', '\t']) {
        const rows = splitRows(text, delimiter);
        for (let index = 0; index < Math.min(rows.length, HEADER_SEARCH_ROWS); index++) {
            const roles = rolesOf(rows[index].cells);
            if (roles.has('date') && (roles.has('credit') || roles.has('amount'))) {
                return { rows, delimiter, headerIndex: index, roles };
            }
        }
    }
    return null;
}

function rolesOf(cells: string[]): Map<Role, number> {
    const roles = new Map<Role, number>();
    const normalized = cells.map(normalizeHeader);
    for (const role of Object.keys(HEADER_NAMES) as Role[]) {
        for (const name of HEADER_NAMES[role]) {
            const index = normalized.findIndex((cell, position) => cell === name && ![...roles.values()].includes(position));
            if (index !== -1) {
                roles.set(role, index);
                break;
            }
        }
    }
    return roles;
}

/** CSV rows, quote-aware: a delimiter or a line break inside quotes belongs to the cell. */
function splitRows(text: string, delimiter: string): { cells: string[]; line: number }[] {
    const rows: { cells: string[]; line: number }[] = [];
    let cells: string[] = [];
    let cell = '';
    let quoted = false;
    let line = 1;
    let rowStart = 1;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (quoted) {
            if (char === '"') {
                if (text[i + 1] === '"') {
                    cell += '"';
                    i++;
                } else {
                    quoted = false;
                }
            } else {
                if (char === '\n') line++;
                cell += char;
            }
            continue;
        }
        if (char === '"' && cell.trim() === '') {
            quoted = true;
            cell = '';
        } else if (char === delimiter) {
            cells.push(cell);
            cell = '';
        } else if (char === '\n' || char === '\r') {
            if (char === '\r' && text[i + 1] === '\n') i++;
            cells.push(cell);
            rows.push({ cells, line: rowStart });
            cells = [];
            cell = '';
            line++;
            rowStart = line;
        } else {
            cell += char;
        }
    }
    if (cell !== '' || cells.length > 0) {
        cells.push(cell);
        rows.push({ cells, line: rowStart });
    }
    return rows;
}
