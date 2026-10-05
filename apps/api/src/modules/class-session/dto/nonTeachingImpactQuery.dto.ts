import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Matches, Min } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * What the calendar screen asks before a period is added. The route read three bare query values,
 * so a request without dates died on `undefined.split` — a TypeError, a 500 and a row on the error
 * screen for a question that was simply incomplete (QA of 27 September 2026).
 */
export class NonTeachingImpactQueryDto {
    @ApiProperty({ example: '2026-12-21' })
    @Matches(DAY, { message: 'Prima zi se scrie AAAA-LL-ZZ, de exemplu 2026-12-21' })
    @IsDateString({ strict: true }, { message: 'Prima zi nu e o zi din calendar' })
    startDate: string;

    @ApiProperty({ example: '2027-01-07' })
    @Matches(DAY, { message: 'Ultima zi se scrie AAAA-LL-ZZ, de exemplu 2027-01-07' })
    @IsDateString({ strict: true }, { message: 'Ultima zi nu e o zi din calendar' })
    endDate: string;

    /** `@Type` is not optional: implicit conversion is off, so a query string stays a string. */
    @ApiPropertyOptional({ example: 1, description: 'One location; the whole school when absent' })
    @EmptyToUndefined()
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: 'Locația aleasă nu e validă' })
    @Min(1, { message: 'Locația aleasă nu e validă' })
    locationId?: number;
}
