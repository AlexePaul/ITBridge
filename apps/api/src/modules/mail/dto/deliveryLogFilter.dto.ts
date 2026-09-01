import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';
import { OutboxStatus } from 'src/enum/outbox-status.enum';

const ISO_DAY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export class DeliveryLogFilterDto {
    @ApiPropertyOptional({ enum: OutboxStatus })
    @EmptyToUndefined()
    @IsOptional()
    @IsEnum(OutboxStatus)
    status?: OutboxStatus;

    @ApiPropertyOptional({ description: 'Substring of the recipient address' })
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    to?: string;

    @ApiPropertyOptional({ example: '2026-09-01' })
    @EmptyToUndefined()
    @IsOptional()
    @Matches(ISO_DAY, { message: 'from must be a date in YYYY-MM-DD form' })
    from?: string;

    @ApiPropertyOptional({ example: '2026-09-30' })
    @EmptyToUndefined()
    @IsOptional()
    @Matches(ISO_DAY, { message: 'until must be a date in YYYY-MM-DD form' })
    until?: string;

    /** `@Type` is not optional: implicit conversion is off, so a query string stays a string. */
    @ApiPropertyOptional({ example: 200 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(500)
    limit?: number;
}
