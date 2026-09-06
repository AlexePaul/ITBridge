import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class SetVacationDto {
    /**
     * Whether this class was held in a school holiday, for whoever wanted to come — E12/S8.
     *
     * A boolean rather than a "toggle" endpoint with no body, so that two people pressing at the
     * same moment both end up with what they saw, not with the tick flipped twice.
     */
    @ApiProperty({ example: true, description: 'True when the hour was held in a school holiday' })
    @IsBoolean()
    isVacation: boolean;
}
