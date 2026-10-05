import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, Matches } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

/**
 * The day a group's roster is asked about. Read straight off the query before, so `?date=abc` and
 * `?date=2026-13-01` reached Postgres and came back as a 500 on the error screen (QA of 27 September
 * 2026). Absent means today, on the school's clock.
 */
export class MembersOnQueryDto {
    @ApiPropertyOptional({ example: '2026-10-05', description: 'YYYY-MM-DD; today when absent' })
    @EmptyToUndefined()
    @IsOptional()
    @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Ziua se scrie AAAA-LL-ZZ, de exemplu 2026-10-05' })
    @IsDateString({ strict: true }, { message: 'Ziua nu e o zi din calendar' })
    date?: string;
}
