import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Matches, Min } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

/**
 * "Bill this many for this child this month, instead of what the registers say" — E15/S9.
 *
 * The one place a number of sessions still enters the platform by hand, and it is a separate,
 * recorded act rather than a field on the issuing call: `POST /invoices/issue` still takes no
 * counts. Sending this is saying "I know what the registers say and I mean something else".
 */
export class SessionCountOverrideDto {
    @ApiProperty({ example: '2026-10', description: 'The teaching month' })
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Luna se scrie AAAA-LL, de exemplu 2026-09' })
    monthIssued: string;

    @ApiProperty({ example: 3 })
    @Type(() => Number)
    @IsInt({ message: 'Copilul ales nu e valid' })
    childId: number;

    @ApiProperty({ example: 3, minimum: 0, description: 'Billed instead of the counted number. Zero means "not this month".' })
    @Type(() => Number)
    @IsInt({ message: 'Numărul de ședințe e un număr întreg' })
    @Min(0, { message: 'Numărul de ședințe nu poate fi negativ' })
    sessions: number;

    @ApiPropertyOptional({ example: 'A venit doar la 3, restul le-am ținut pentru grupa mică', maxLength: 500 })
    @EmptyToUndefined()
    @IsOptional()
    @IsString({ message: 'Motivul corecturii e un text' })
    @Length(1, 500, { message: 'Motivul are cel mult 500 de caractere' })
    reason?: string;
}
