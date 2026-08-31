import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';

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
    @IsOptional()
    @IsString()
    @Length(1, 50000)
    bodyHtml?: string | null;
}

/** The editor's unsaved fields. All optional: whatever is absent previews as currently saved. */
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
