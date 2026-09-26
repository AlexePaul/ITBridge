import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { normalizeRomanianPhone } from './romanian-phone';

describe('normalizeRomanianPhone', () => {
    it.each([
        ['0712345678', '+40712345678'],
        ['0712 345 678', '+40712345678'],
        ['0712-345-678', '+40712345678'],
        ['(0712) 345.678', '+40712345678'],
        ['+40712345678', '+40712345678'],
        ['+40 712 345 678', '+40712345678'],
        ['0040712345678', '+40712345678'],
        ['021 123 4567', '+40211234567'],
    ])('writes %s as %s', (typed, stored) => {
        expect(normalizeRomanianPhone(typed)).toBe(stored);
    });

    it('leaves what is not a number close to how it came, for the validator to refuse by name', () => {
        expect(normalizeRomanianPhone('nu-e-telefon')).toBe('nuetelefon');
    });
});

/**
 * Every telephone the platform compares is stored in one spelling.
 *
 * The profile's number is unique and the privacy flows find a lead by its number, both as string
 * comparisons — so a field that validates a phone and does not normalise it is a second spelling
 * waiting to slip past both. The one exception says why.
 */
const DTO_ROOT = join(__dirname, '..', 'modules');

/**
 * `CreateLocationDto` (and the update that extends it): the number printed for a location is the
 * school's own, typed the way the school wants it read, and never compared with anything.
 */
const PRINTED_AS_TYPED = new Set(['CreateLocationDto']);

function dtoFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) return dtoFiles(path);
        return entry.endsWith('.dto.ts') ? [path] : [];
    });
}

export function unnormalisedPhonesIn(source: string): string[] {
    const lines = source.split('\n');
    const out: string[] = [];
    let className = '';

    for (let i = 0; i < lines.length; i++) {
        const declaring = /^export class (\w+)/.exec(lines[i]);
        if (declaring) className = declaring[1];

        const property = /^\s+(\w+)\??:\s*[\w.[\]| ']+;\s*$/.exec(lines[i]);
        if (!property) continue;

        let start = i;
        while (start > 0 && lines[start - 1].trim() && !/^export class|^\{/.test(lines[start - 1])) start--;
        const block = lines
            .slice(start, i)
            .join('\n')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/\/\/.*$/gm, '');

        if (block.includes('@IsPhoneNumber') && !block.includes('@NormalizePhone') && !PRINTED_AS_TYPED.has(className)) {
            out.push(`${className}.${property[1]}`);
        }
    }
    return out;
}

describe('every phone field', () => {
    it('is normalised before it is validated, compared or stored', () => {
        const offenders = dtoFiles(DTO_ROOT).flatMap((file) =>
            unnormalisedPhonesIn(readFileSync(file, 'utf8')).map((field) => `${file.slice(file.indexOf('modules'))}: ${field}`),
        );

        expect(offenders).toEqual([]);
    });

    it('recognises one that is not', () => {
        const offending = [
            'export class SomeDto {',
            '    @EmptyToUndefined()',
            '    @IsOptional()',
            "    @IsPhoneNumber('RO')",
            '    phone?: string;',
            '}',
        ].join('\n');
        expect(unnormalisedPhonesIn(offending)).toEqual(['SomeDto.phone']);

        expect(unnormalisedPhonesIn(offending.replace('    @IsOptional()', '    @NormalizePhone()\n    @IsOptional()'))).toEqual([]);
    });
});
