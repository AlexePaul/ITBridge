import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Matches, Min } from 'class-validator';

/**
 * "Bill this many for this child this month, instead of what the registers say" — E15/S9.
 *
 * The one place a number of sessions still enters the platform by hand, and it is a separate,
 * recorded act rather than a field on the issuing call: `POST /invoices/issue` still takes no
 * counts. Sending this is saying "I know what the registers say and I mean something else".
 */
export class SessionCountOverrideDto {
    @ApiProperty({ example: '2026-10', description: 'The teaching month' })
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'monthIssued must be YYYY-MM' })
    monthIssued: string;

    @ApiProperty({ example: 3 })
    @Type(() => Number)
    @IsInt()
    childId: number;

    @ApiProperty({ example: 3, minimum: 0, description: 'Billed instead of the counted number. Zero means "not this month".' })
    @Type(() => Number)
    @IsInt()
    @Min(0)
    sessions: number;

    @ApiPropertyOptional({ example: 'A venit doar la 3, restul le-am ținut pentru grupa mică', maxLength: 500 })
    @IsOptional()
    @IsString()
    @Length(1, 500)
    reason?: string;
}
