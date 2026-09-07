import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, ValidateIf } from 'class-validator';

/**
 * The fact that the enrolment contract was signed, and when — E07/S8.
 *
 * The contract itself is paper, signed in the room, and the platform keeps neither its text nor an
 * acceptance. This records the one thing worth recording: that it exists, from which date. `null`
 * takes a wrong date back — a typo in the year is corrected by clearing, not by pretending the
 * paper was signed on some other day.
 */
export class RecordContractDto {
    @ApiProperty({ example: '2026-09-14', nullable: true, description: 'The day the contract was signed, or null to clear a mistaken entry' })
    @ValidateIf((_object, value) => value !== null)
    @IsDateString()
    contractSignedAt: string | null;
}
