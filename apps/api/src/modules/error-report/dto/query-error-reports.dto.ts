import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';
import { ErrorSource } from 'src/enum/error-source.enum';

export const ERROR_REPORT_STATES = ['open', 'resolved', 'all'] as const;
export type ErrorReportState = (typeof ERROR_REPORT_STATES)[number];

/** What `/admin/erori` asks for — E06 S1. */
export class QueryErrorReportsDto {
    @ApiPropertyOptional({ enum: ERROR_REPORT_STATES, default: 'open' })
    @EmptyToUndefined()
    @IsOptional()
    @IsIn(ERROR_REPORT_STATES)
    state?: ErrorReportState;

    @ApiPropertyOptional({ enum: ErrorSource })
    @EmptyToUndefined()
    @IsOptional()
    @IsEnum(ErrorSource)
    source?: ErrorSource;

    /**
     * The code a screen showed — the first characters of a request id or of a browser's reference.
     * Letters, digits and dashes only, so it can go into a `LIKE` with nothing to escape.
     */
    @ApiPropertyOptional({ example: '3f2a9c1d' })
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    @Matches(/^[A-Za-z0-9-]{4,64}$/, { message: 'Codul are între 4 și 64 de litere, cifre sau cratime.' })
    ref?: string;

    @ApiPropertyOptional({ default: 100, maximum: 200 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(200)
    limit?: number;
}
