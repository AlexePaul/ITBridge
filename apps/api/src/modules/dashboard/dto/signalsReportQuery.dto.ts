import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import { ISO_DATE_MESSAGE, ISO_DATE_PATTERN } from 'src/modules/class-session/class-session.dates';

/**
 * The day the early signals are evaluated for — E21/S7. Omitted, it is today. A past day is the
 * retrospective check the story asks for: what would this list have said on that Monday.
 */
export class SignalsReportQueryDto {
    @ApiPropertyOptional({ example: '2026-03-30', description: 'Evaluate the signals as they stood on this day. Defaults to today.' })
    @IsOptional()
    @Matches(ISO_DATE_PATTERN, { message: `asOf ${ISO_DATE_MESSAGE}` })
    asOf?: string;
}
