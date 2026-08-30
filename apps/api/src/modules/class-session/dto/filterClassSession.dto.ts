import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Matches } from 'class-validator';
import { ClassSessionStatus } from 'src/enum/class-session-status.enum';
import { ISO_DATE_MESSAGE, ISO_DATE_PATTERN } from '../class-session.dates';

export class FilterClassSessionDto {
    // `@Type(() => Number)` is required, not decorative: `enableImplicitConversion` is off, so a
    // query string arrives as `"1"` and `@IsInt()` would reject it.
    @ApiPropertyOptional({ example: 1, description: 'Only the sessions of this group' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    groupId?: number;

    /** Inclusive, like `dateTo`. A single day is `dateFrom` and `dateTo` set to the same value. */
    @ApiPropertyOptional({ example: '2026-09-01', description: 'First day of the interval, inclusive' })
    @IsOptional()
    @Matches(ISO_DATE_PATTERN, { message: `dateFrom ${ISO_DATE_MESSAGE}` })
    dateFrom?: string;

    @ApiPropertyOptional({ example: '2026-09-30', description: 'Last day of the interval, inclusive' })
    @IsOptional()
    @Matches(ISO_DATE_PATTERN, { message: `dateTo ${ISO_DATE_MESSAGE}` })
    dateTo?: string;

    @ApiPropertyOptional({ enum: ClassSessionStatus, example: ClassSessionStatus.SCHEDULED })
    @IsOptional()
    @IsEnum(ClassSessionStatus)
    status?: ClassSessionStatus;
}
