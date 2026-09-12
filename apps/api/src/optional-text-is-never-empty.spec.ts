import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * An untouched text input means "not provided", on every optional field there is.
 *
 * An HTML form submits every text input it has, and an empty one arrives as `''`, never as
 * `undefined`. `@IsOptional()` skips `undefined` and `null` and nothing else, so
 * `@IsOptional() @Length(1, 255)` rejects precisely the payload the form always sends — which is
 * how the parent's profile screen became impossible to complete the day validation was switched on.
 * `@EmptyToUndefined()` is the answer and has been since; it had simply stopped being applied.
 *
 * The forty-eight fields this found were not all the same kind of wrong, and the two kinds are
 * worth telling apart:
 *
 * - Most were **refusals**: a `@Length`, a `@Matches`, an `@IsEnum` or an `@IsDateString` that a
 *   cleared box cannot satisfy, so the request came back 400 with a sentence about a field the
 *   person had deliberately left blank.
 * - A few were worse, because they *accepted* it. `PUT /children/:id` took `firstName: ''` and
 *   wrote it: an optional field with no length bound is a way to blank a child's name by clearing a
 *   box and pressing save.
 *
 * So the rule is not "stop the 400s", it is that an empty text field is an absent one. That is a
 * decision about what the API means, and it belongs on the API rather than in every caller that
 * has to remember `|| undefined` on the way out — three screens already carry that workaround, and
 * a fourth was always going to forget.
 */

const DTO_ROOT = join(__dirname, 'modules');

/** Decorators that tell us the value is text, whatever the declared type says. */
const TEXT_VALIDATORS = ['@IsString', '@IsEmail', '@Matches', '@IsPhoneNumber', '@Length', '@MinLength', '@IsEnum', '@IsDateString'];

/**
 * Classes where `''` is a state rather than an absence, with the reason.
 *
 * One, today. The template editor previews exactly what is in its boxes, so a cleared subject has
 * to preview as a cleared subject and not as the one still saved on the server.
 */
const EMPTY_MEANS_SOMETHING = new Set(['PreviewMailTemplateDto']);

/**
 * The block as code only.
 *
 * Not fussiness: `CancelClassSessionDto.reason` explains in prose that it is **"Required, and not
 * `@IsOptional()`"**, and the first version of this sweep read that sentence, decided the field was
 * optional, and asked for a transform on a field that must never be absent. A guard that reads
 * comments is a guard that answers to whoever wrote them.
 */
function withoutComments(block: string): string {
    return block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function dtoFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((entry) => {
        const path = join(dir, entry);
        if (statSync(path).isDirectory()) return dtoFiles(path);
        return entry.endsWith('.dto.ts') ? [path] : [];
    });
}

/** `ClassName.property` for every optional text field that does not empty-to-undefined. */
export function offendersIn(source: string): string[] {
    const lines = source.split('\n');
    const out: string[] = [];
    let className = '';

    for (let i = 0; i < lines.length; i++) {
        const declaring = /^export class (\w+)/.exec(lines[i]);
        if (declaring) className = declaring[1]!;

        const property = /^\s+(\w+)\??:\s*[\w.[\]| ']+;\s*$/.exec(lines[i]);
        if (!property) continue;

        // The decorator block is everything above it, back to the blank line that separates fields.
        let start = i;
        while (start > 0 && lines[start - 1].trim() && !/^export class|^\{/.test(lines[start - 1])) start--;
        const block = withoutComments(lines.slice(start, i).join('\n'));

        if (!block.includes('@IsOptional')) continue;
        if (block.includes('@EmptyToUndefined')) continue;
        if (EMPTY_MEANS_SOMETHING.has(className)) continue;

        const isText = lines[i].includes('string') || TEXT_VALIDATORS.some((validator) => block.includes(validator));
        if (isText) out.push(`${className}.${property[1]}`);
    }
    return out;
}

describe('every optional text field', () => {
    it('treats an empty string as an absent one', () => {
        const offenders = dtoFiles(DTO_ROOT).flatMap((file) => {
            const relative = file.slice(file.indexOf('modules'));
            return offendersIn(readFileSync(file, 'utf8')).map((field) => `${relative}: ${field}`);
        });

        // A new one here means `@EmptyToUndefined()` above `@IsOptional()`. If `''` genuinely means
        // something for that field, add its class to `EMPTY_MEANS_SOMETHING` with the sentence that
        // says what.
        expect(offenders).toEqual([]);
    });

    it('recognises the shape it is looking for', () => {
        // The sweep reads text, so it is worth proving it can still see an offender — a guard that
        // silently stopped matching anything would pass forever.
        const offending = `
export class SomeDto {
    @ApiPropertyOptional()
    @IsOptional()
    @Length(1, 255)
    note?: string;
}`;
        expect(offendersIn(offending)).toEqual(['SomeDto.note']);

        const fixed = offending.replace('    @IsOptional()', '    @EmptyToUndefined()\n    @IsOptional()');
        expect(offendersIn(fixed)).toEqual([]);
    });

    it('reads the decorators and not the prose above them', () => {
        // The flaw this sweep shipped with for about ten minutes. A required field whose comment
        // says why it is *not* optional was read as optional, and the transform went onto a field
        // that must never be absent.
        const required = [
            'export class SomeDto {',
            '    /** Required, and not `@IsOptional()`: the answer "not recorded" helps nobody. */',
            '    @ApiProperty()',
            '    @IsString()',
            '    @Length(3, 500)',
            '    reason: string;',
            '}',
        ].join('\n');

        expect(offendersIn(required)).toEqual([]);
    });
});
