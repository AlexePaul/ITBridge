import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

/**
 * The days the funnel covers, both ends included — E20/S4.
 *
 * Days rather than the finance report's months: acquisition is read against a campaign or a week of
 * open days, and rounding those to whole months would smear exactly the edge somebody is looking at.
 * Both optional; with neither, the last three months.
 */
export class FunnelReportQueryDto {
    @ApiPropertyOptional({ example: '2026-06-01', description: 'First day, YYYY-MM-DD' })
    @EmptyToUndefined()
    @IsOptional()
    @IsDateString()
    from?: string;

    @ApiPropertyOptional({ example: '2026-09-04', description: 'Last day, YYYY-MM-DD' })
    @EmptyToUndefined()
    @IsOptional()
    @IsDateString()
    to?: string;
}
