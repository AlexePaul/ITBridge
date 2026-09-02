import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import { BILLING_MONTH_MESSAGE, BILLING_MONTH_PATTERN } from '../reports.rules';

/**
 * The months the finance report covers, both ends included.
 *
 * Both optional: with neither, the report shows the last twelve months; with only one, the other
 * end is derived from it. A range with `to` before `from` is answered with an empty set of months
 * rather than an error — there is nothing wrong with the request, there is just nothing in it.
 */
export class FinanceReportQueryDto {
    @ApiPropertyOptional({ example: '2025-09', description: 'First billing month, YYYY-MM' })
    @IsOptional()
    @Matches(BILLING_MONTH_PATTERN, { message: `from ${BILLING_MONTH_MESSAGE}` })
    from?: string;

    @ApiPropertyOptional({ example: '2026-08', description: 'Last billing month, YYYY-MM' })
    @IsOptional()
    @Matches(BILLING_MONTH_PATTERN, { message: `to ${BILLING_MONTH_MESSAGE}` })
    to?: string;
}
