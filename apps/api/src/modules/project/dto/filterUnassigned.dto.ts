import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional } from 'class-validator';

/**
 * Query for the unassigned list.
 *
 * A declared class rather than loose `@Query` parameters, because validation runs with `whitelist`
 * and `forbidNonWhitelisted`: a field no DTO declares does not get ignored, it rejects the request.
 */
export class FilterUnassignedDto {
    @ApiPropertyOptional({ example: 3 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    groupId?: number;

    /**
     * A query string is `"true"`, never a boolean, and `enableImplicitConversion` is off on purpose —
     * so the conversion is written out here rather than hoped for.
     */
    @ApiPropertyOptional({ example: false, description: 'Include the ones an admin has already dealt with' })
    @IsOptional()
    @Transform(({ value }: { value: unknown }) => value === 'true' || value === true)
    @IsBoolean()
    includeResolved?: boolean;
}
