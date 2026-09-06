import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, Matches } from 'class-validator';

/**
 * What issuing a month takes — E15/S9: the month, and the date to print on the invoice.
 *
 * **No counts.** `IssueFromSessionsDto` carried a number of sessions per child, typed by whoever
 * was issuing; that was S0's model, and S9 replaced the typing with the register. The server now
 * counts from the month's sessions and marks, and a request that still sends `families` gets a
 * 400 from `forbidNonWhitelisted` rather than being quietly ignored — a client that believes it is
 * choosing the amounts should find out that it is not.
 */
export class IssueMonthDto {
    @ApiProperty({ example: '2026-10', description: 'The teaching month: the weeks whose Monday falls in it' })
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'monthIssued must be YYYY-MM' })
    monthIssued: string;

    @ApiProperty({ example: '2026-11-01', description: 'Printed on the invoice; the 14-day term runs from it' })
    @IsDateString()
    dateIssued: string;
}
