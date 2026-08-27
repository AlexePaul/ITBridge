import { Transform } from 'class-transformer';

/**
 * Turns `''` into `undefined` before validation runs, so `@IsOptional()` actually skips the field.
 *
 * An HTML form submits every untouched text input as an empty string, never as `undefined`.
 * `@IsOptional()` only skips `undefined` and `null`, so `@IsOptional() @Length(1, 255)` on an
 * address rejects the exact payload the profile form always sends — which is how the parent
 * onboarding screen became impossible to complete the moment validation was switched on.
 *
 * Whitespace is trimmed first: a field holding only spaces is not filled in either.
 */
export function EmptyToUndefined(): PropertyDecorator {
    return Transform(({ value }: { value: unknown }) => {
        if (typeof value !== 'string') return value;
        const trimmed = value.trim();
        return trimmed === '' ? undefined : trimmed;
    });
}
