import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { plainToInstance } from 'class-transformer';
import { IsDateString, validateSync } from 'class-validator';

/**
 * A date a DTO accepts is a day that exists.
 *
 * `@IsDateString()` checks the **shape** and nothing else: `2026-02-30` and `2026-09-31` are
 * well-formed, so they passed validation and reached Postgres, which refused them (22008,
 * `date/time field value out of range`) — and the refusal went out as a 500, onto the error screen,
 * as a fault of the server's (QA of 27 September 2026: `/reports/funnel?from=2026-02-30`,
 * `/deliveries?from=2026-02-31`). `strict: true` is the option that asks whether the day is real,
 * and twenty of the twenty-three uses in the DTOs did not pass it.
 *
 * Read from the sources, like the other sweeps here, so a new DTO is held to it without anybody
 * writing a test for it: every `@IsDateString(` carries `strict: true`.
 */

const DTO_ROOT = join(__dirname, 'modules');

function dtoFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) return dtoFiles(path);
        return entry.endsWith('.dto.ts') ? [path] : [];
    });
}

/**
 * The source with its comments blanked, line breaks kept so line numbers still point at the code.
 * `createChild.dto.ts` explains in prose why `@IsDateString()` alone is not enough; a sweep that read
 * the sentence would flag the explanation.
 */
function codeOnly(source: string): string {
    const blank = (comment: string) => comment.replace(/[^\n]/g, ' ');
    return source.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/.*$/gm, blank);
}

/** Each `@IsDateString(...)` call with its arguments, and the line it starts on. */
export function lenientDateChecks(text: string): number[] {
    const source = codeOnly(text);
    const lines: number[] = [];
    const pattern = /@IsDateString\(/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
        // The arguments run to the matching parenthesis; options and message both live in there.
        let depth = 1;
        let end = match.index + match[0].length;
        while (end < source.length && depth > 0) {
            if (source[end] === '(') depth += 1;
            if (source[end] === ')') depth -= 1;
            end += 1;
        }
        const call = source.slice(match.index, end);
        if (!/strict:\s*true/.test(call)) lines.push(source.slice(0, match.index).split('\n').length);
    }
    return lines;
}

describe('a date a DTO accepts', () => {
    it('is a day that exists: every @IsDateString is strict', () => {
        const offenders = dtoFiles(DTO_ROOT).flatMap((file) =>
            lenientDateChecks(readFileSync(file, 'utf8')).map((line) => `${file.slice(DTO_ROOT.length + 1)}:${line}`),
        );

        expect(offenders).toEqual([]);
    });

    it('would notice one', () => {
        expect(lenientDateChecks('    @IsDateString()\n    from?: string;')).toEqual([1]);
        expect(lenientDateChecks("    @IsDateString({}, { message: 'x' })")).toEqual([1]);
        expect(lenientDateChecks("    @IsDateString({ strict: true }, { message: 'x' })")).toEqual([]);
        expect(lenientDateChecks('/**\n * `@IsDateString()` alone takes a full timestamp\n */\n@IsDateString({ strict: true })')).toEqual([]);
    });

    /** What the option buys, so nobody "simplifies" it away. */
    it('refuses the thirtieth of February with the option, and lets it through without', () => {
        class Strict {
            @IsDateString({ strict: true })
            day!: string;
        }
        class Lenient {
            @IsDateString()
            day!: string;
        }

        expect(validateSync(plainToInstance(Strict, { day: '2026-02-30' }))).toHaveLength(1);
        expect(validateSync(plainToInstance(Strict, { day: '2028-02-29' }))).toHaveLength(0);
        expect(validateSync(plainToInstance(Strict, { day: '2026-10-05T09:30:00Z' }))).toHaveLength(0);
        expect(validateSync(plainToInstance(Lenient, { day: '2026-02-30' }))).toHaveLength(0);
    });
});
