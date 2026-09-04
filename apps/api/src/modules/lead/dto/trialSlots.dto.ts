import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional } from 'class-validator';

/**
 * What the public form asks for before it can offer anything — E20/S2.
 *
 * The birth date is required because the age it implies is half the filter, and the other half is
 * capacity. A list that ignored either would be offering seats that do not exist or classes the
 * child cannot join.
 */
export class TrialSlotsDto {
    @ApiProperty({ example: '2016-04-04' })
    @IsDateString()
    birthDate: string;

    @ApiPropertyOptional({ description: 'Narrow to one address. Omitted, both are offered.' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    locationId?: number;
}
