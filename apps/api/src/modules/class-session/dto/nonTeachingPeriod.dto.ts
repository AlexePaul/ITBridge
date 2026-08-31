import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Length } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

export class CreateNonTeachingPeriodDto {
    /** Shown on screen and written into the note of every class it cancels. */
    @ApiProperty({ example: 'Vacanța de iarnă' })
    @IsString()
    @Length(1, 120)
    name: string;

    @ApiProperty({ example: '2026-12-21' })
    @IsDateString()
    startDate: string;

    /** Inclusive, and equal to `startDate` for a single day — which most of them are. */
    @ApiProperty({ example: '2027-01-07' })
    @IsDateString()
    endDate: string;

    /**
     * Which location is closed. **Omit for the whole school**, which is the case for every national
     * holiday and every school break — that is, for all of them today.
     */
    @ApiPropertyOptional({ example: 1, description: 'Gol înseamnă toată școala' })
    @EmptyToUndefined()
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    locationId?: number;
}
