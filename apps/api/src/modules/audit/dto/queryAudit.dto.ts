import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

/**
 * What to look up in the trail — E07 S3.
 *
 * `@Type(() => Number)` on every numeric field, because `enableImplicitConversion` is off by
 * decision (CLAUDE.md): without it a query string's `"412"` reaches `@IsInt()` as a string and is
 * refused.
 */
export class QueryAuditDto {
    /** `Payment`, `Invoice`, `Discount` — the class name, as the log stores it. */
    @ApiPropertyOptional({ example: 'Invoice' })
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    @Length(1, 60)
    entityType?: string;

    @ApiPropertyOptional({ example: 412 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    entityId?: number;

    @ApiPropertyOptional({ description: 'Only what this user did.' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    actorUserId?: number;

    /**
     * Capped, and capped low. The trail grows without bound by design, so an unbounded read is a
     * way to pull the whole history of a family's money through one request.
     */
    @ApiPropertyOptional({ default: 50, maximum: 200 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(200)
    limit?: number;
}
