import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Length } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

export class TransferEnrollmentDto {
    @ApiProperty({ example: 1 })
    @Type(() => Number)
    @IsInt()
    childId: number;

    @ApiProperty({ example: 3, description: 'Grupa în care se mută' })
    @Type(() => Number)
    @IsInt()
    toGroupId: number;

    /** Written on the closed row. Defaults to naming the group the child moved to. */
    @ApiPropertyOptional({ example: 'Familia a cerut ziua de marți' })
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    @Length(1, 500)
    reason?: string;

    @ApiPropertyOptional({ default: false })
    @IsOptional()
    @IsBoolean()
    allowOverCapacity?: boolean;

    /** Confirms the soft checks from S6 — an age outside the group's band, today. */
    @ApiPropertyOptional({ default: false })
    @IsOptional()
    @IsBoolean()
    acknowledgeWarnings?: boolean;
}
