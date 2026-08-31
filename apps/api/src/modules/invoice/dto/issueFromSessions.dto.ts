import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsInt, Matches, Min, ValidateNested } from 'class-validator';

/** One child's line: how many sessions they had in the month. */
export class ChildSessionsDto {
    @ApiProperty({ example: 3 })
    @Type(() => Number)
    @IsInt()
    childId: number;

    /**
     * Sessions held for this child in the month.
     *
     * **Zero is allowed and is not the same as blank.** A child who was enrolled but had no classes
     * — joined at the end of the month, group did not run — is a real answer, and the screen
     * requires it to be given rather than assumed. What is refused is a missing field: an amount
     * nobody stated is the one thing that must never reach an invoice.
     */
    @ApiProperty({ example: 4, minimum: 0 })
    @Type(() => Number)
    @IsInt()
    @Min(0)
    sessions: number;
}

export class FamilySessionsDto {
    @ApiProperty({ example: 1, description: 'Profile id of the parent' })
    @Type(() => Number)
    @IsInt()
    parentId: number;

    @ApiProperty({ type: [ChildSessionsDto] })
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => ChildSessionsDto)
    children: ChildSessionsDto[];
}

/**
 * A month's invoices, issued from the session counts an admin has just checked.
 *
 * The amounts are not recomputed from the timetable on the way in. The person pressing the button
 * has looked at every number, and a server that quietly substituted its own would make that look
 * pointless — and would issue a different invoice from the one on screen, which is the worst
 * possible outcome for a document that goes to a family and to the accountant.
 */
export class IssueFromSessionsDto {
    @ApiProperty({ example: '2026-10' })
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'monthIssued must be YYYY-MM' })
    monthIssued: string;

    @ApiProperty({ example: '2026-10-01' })
    @IsDateString()
    dateIssued: string;

    @ApiProperty({ type: [FamilySessionsDto] })
    @IsArray()
    @ArrayMinSize(1)
    @ValidateNested({ each: true })
    @Type(() => FamilySessionsDto)
    families: FamilySessionsDto[];
}
