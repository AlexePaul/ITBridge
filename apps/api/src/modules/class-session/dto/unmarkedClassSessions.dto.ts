import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';
import { ISO_DATE_MESSAGE, ISO_DATE_PATTERN } from '../class-session.dates';

/**
 * Both ends are required, unlike the list filter.
 *
 * "Everything ever taught that nobody marked" is not a question anyone means to ask, and answering
 * it grows without bound as the school gets older. The daily job passes yesterday twice; the
 * timetable screen passes the week it is showing.
 */
export class UnmarkedClassSessionsDto {
    @ApiProperty({ example: '2026-09-01', description: 'First day of the interval, inclusive' })
    @Matches(ISO_DATE_PATTERN, { message: `dateFrom ${ISO_DATE_MESSAGE}` })
    dateFrom: string;

    @ApiProperty({ example: '2026-09-07', description: 'Last day of the interval, inclusive' })
    @Matches(ISO_DATE_PATTERN, { message: `dateTo ${ISO_DATE_MESSAGE}` })
    dateTo: string;
}
