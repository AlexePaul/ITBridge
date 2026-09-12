import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches } from 'class-validator';
import { ISO_DATE_MESSAGE, ISO_DATE_PATTERN } from 'src/modules/class-session/class-session.dates';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

/**
 * Query for `GET /attendance/absences`.
 *
 * `from` widens the list backwards. The default is "classes still to come", which is the parent's
 * question; the office's screen asks from the Monday of the current week instead, because a child
 * moved out of Monday's class into Thursday's is a move that still matters on Tuesday — and the
 * missed class, the one the row is keyed on, is already behind. Without this the row would leave
 * the office's list the moment the missed hour passed, with the replacement still ahead and nobody
 * able to check or take it back from the screen.
 */
export class UpcomingAbsencesQueryDto {
    @ApiPropertyOptional({ example: '2026-09-07', description: 'List from this day on, inclusive. Defaults to now.' })
    @EmptyToUndefined()
    @IsOptional()
    @Matches(ISO_DATE_PATTERN, { message: `from ${ISO_DATE_MESSAGE}` })
    from?: string;
}
