import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional } from 'class-validator';
import { LeadStatus } from 'src/enum/lead-status.enum';

/**
 * What the leads screen filters on — E20/S1.
 *
 * `enableImplicitConversion` is off in this codebase on purpose, so a query string needs its
 * conversion spelled out: `@Type(() => Number)` for the ids, and an explicit transform for the
 * booleans, because `'false'` is a non-empty string and would otherwise be true.
 */
export class FilterLeadsDto {
    @ApiPropertyOptional({ enum: LeadStatus })
    @IsOptional()
    @IsEnum(LeadStatus)
    status?: LeadStatus;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    assignedToId?: number;

    /** Leads with nobody's name against them, which is the first thing S3's screen shows. */
    @ApiPropertyOptional()
    @IsOptional()
    @Transform(({ value }) => value === true || value === 'true')
    @IsBoolean()
    unassigned?: boolean;

    /** Enrolled and lost leads are finished; the screen leaves them out unless asked. */
    @ApiPropertyOptional()
    @IsOptional()
    @Transform(({ value }) => value === true || value === 'true')
    @IsBoolean()
    includeSettled?: boolean;
}
