import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString, Length, Matches } from 'class-validator';
import { ISO_DATE_MESSAGE, ISO_DATE_PATTERN } from '../class-session.dates';

/**
 * A moved class is one whose columns changed — E12/S5. There is no "moved" status on purpose (the
 * epic's decision); the row keeps its identity and its register, and only the where and the when
 * move. Every target field is optional, but the service refuses a body that names none of them:
 * a move that moves nothing is a mistyped request, not a no-op.
 */
export class MoveClassSessionDto {
    @ApiPropertyOptional({ example: '2026-03-16', description: 'The new day' })
    @IsOptional()
    @Matches(ISO_DATE_PATTERN, { message: `date ${ISO_DATE_MESSAGE}` })
    date?: string;

    @ApiPropertyOptional({ example: '17:00', description: 'The new start' })
    @IsOptional()
    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'startTime must be HH:mm' })
    startTime?: string;

    @ApiPropertyOptional({ example: '18:30', description: 'The new end' })
    @IsOptional()
    @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'endTime must be HH:mm' })
    endTime?: string;

    @ApiPropertyOptional({ example: 2, description: 'The new room' })
    @IsOptional()
    @IsNumber()
    roomId?: number;

    /**
     * Required, exactly as it is for a cancellation: a moved class is something a parent will ask
     * about, and "the reason was not recorded" is the answer nobody can act on.
     */
    @ApiProperty({ example: 'Sala ocupată de eveniment', description: 'Why the class moves. Shown in the timetable.' })
    @IsString()
    @Length(3, 500)
    reason: string;
}
