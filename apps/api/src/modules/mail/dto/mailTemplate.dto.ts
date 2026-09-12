import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

export class UpdateMailTemplateDto {
    @ApiProperty({ description: 'The subject line. Placeholders welcome.' })
    @IsString()
    @Length(1, 500)
    subject: string;

    @ApiProperty({ description: 'The plain-text body. Every message has one.' })
    @IsString()
    @Length(1, 20000)
    bodyText: string;

    /** Null clears the HTML variant; the message then goes out text-only. */
    @ApiPropertyOptional({ description: 'The HTML body, or null for text-only' })
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    @Length(1, 50000)
    bodyHtml?: string | null;
}

/**
 * The editor's unsaved fields. All optional: whatever is absent previews as currently saved.
 *
 * **The one place `''` is not the same as absent**, and so the one class without
 * `@EmptyToUndefined()`. Everywhere else an untouched text input means "not provided"; here it
 * means "the admin has cleared this box", and a preview that answered with the subject still saved
 * on the server would be showing them something they are not about to send.
 */
export class PreviewMailTemplateDto {
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    subject?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    bodyText?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    bodyHtml?: string | null;
}
