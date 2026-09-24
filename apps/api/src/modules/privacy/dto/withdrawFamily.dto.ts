import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

/**
 * The day the family left — E04/S5. Optional: left out, the school's today is recorded, which is the
 * usual case of an office writing it down as the family says so.
 */
export class WithdrawFamilyDto {
    @ApiPropertyOptional({ example: '2026-09-24', description: 'The day the family left, `YYYY-MM-DD`; today when left out. Not in the future.' })
    @EmptyToUndefined()
    @IsOptional()
    @IsDateString({ strict: true })
    withdrawnOn?: string;
}
