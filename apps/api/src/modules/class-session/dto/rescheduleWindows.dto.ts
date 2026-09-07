import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Matches } from 'class-validator';
import { ISO_DATE_MESSAGE, ISO_DATE_PATTERN } from '../class-session.dates';

/** Which class cannot be held — the same pair `RescheduleClassSessionDto` is keyed on. */
export class RescheduleWindowsDto {
    // `@Type(() => Number)` is required, not decorative: `enableImplicitConversion` is off, so a
    // query string arrives as `"7"` and `@IsInt()` would reject it.
    @ApiProperty({ example: 7, description: 'The group whose class cannot be held' })
    @Type(() => Number)
    @IsInt()
    groupId: number;

    @ApiProperty({ example: '2027-04-05', description: 'The day the class was, or would have been, on' })
    @Matches(ISO_DATE_PATTERN, { message: `date ${ISO_DATE_MESSAGE}` })
    date: string;
}
