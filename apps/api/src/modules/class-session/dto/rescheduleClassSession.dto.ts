import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Length, Matches } from 'class-validator';
import { ISO_DATE_MESSAGE, ISO_DATE_PATTERN } from '../class-session.dates';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

/**
 * A class that cannot be held, and where it goes instead — E12/S9.
 *
 * Keyed on the **group and the day**, not on a session id, because the class may not be a row:
 * when the day was in the school calendar before the timetable was generated, nothing was written
 * for it, and there is no id to name. The same pair identifies a scheduled row and a cancelled one,
 * so one request covers all three starting states.
 *
 * `targetDate` is required where `MoveClassSessionDto.date` is optional: the whole point of this
 * act is another day. Hour and room default to the class's own, exactly as a move does.
 */
export class RescheduleClassSessionDto {
    @ApiProperty({ example: 7, description: 'The group whose class cannot be held' })
    @IsInt()
    groupId: number;

    @ApiProperty({ example: '2027-04-05', description: 'The day the class was, or would have been, on' })
    @Matches(ISO_DATE_PATTERN, { message: `date ${ISO_DATE_MESSAGE}` })
    date: string;

    @ApiProperty({ example: '2027-04-06', description: 'The day it moves to. Must be in the same week.' })
    @Matches(ISO_DATE_PATTERN, { message: `targetDate ${ISO_DATE_MESSAGE}` })
    targetDate: string;

    @ApiPropertyOptional({ example: '17:00', description: 'The new start. Defaults to the class’s own.' })
    @EmptyToUndefined()
    @IsOptional()
    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'startTime must be HH:mm' })
    startTime?: string;

    @ApiPropertyOptional({ example: '18:30', description: 'The new end. Defaults to the class’s own.' })
    @EmptyToUndefined()
    @IsOptional()
    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'endTime must be HH:mm' })
    endTime?: string;

    @ApiPropertyOptional({ example: 2, description: 'The room. Defaults to the class’s own.' })
    @IsOptional()
    @IsInt()
    roomId?: number;

    /** Required, as for a cancellation or a move: the families are told why. */
    @ApiProperty({ example: 'Luni e zi liberă legală', description: 'Why the class moves. Shown in the timetable and in the email.' })
    @IsString()
    @Length(3, 500)
    reason: string;
}
