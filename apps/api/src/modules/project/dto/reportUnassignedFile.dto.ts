import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';
import { UnassignedFileReason } from 'src/enum/unassigned-file-reason.enum';

/**
 * The agent saying it moved something to `_neatribuite` and cannot place it. E14/S2.
 *
 * Nothing is lost in silence: the file stays on the share and this row puts it on the group screen
 * with the reason, as a task for an admin. The same discipline E17/S5 applies to a recipient with no
 * address — an absent assignment is information, not a line to skip.
 */
export class ReportUnassignedFileDto {
    @ApiPropertyOptional({ example: 3, description: 'The group whose folder it turned up in; absent at the root of the share' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    groupId?: number;

    @ApiProperty({ example: 'Straulesti/Scratch Incepatori/_neatribuite/proiect.sb3' })
    @IsString()
    @Length(1, 1024)
    relativePath: string;

    @ApiProperty({ example: 'proiect.sb3' })
    @IsString()
    @Length(1, 255)
    fileName: string;

    @ApiPropertyOptional({ example: 128_000 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    sizeBytes?: number;

    @ApiProperty({ enum: UnassignedFileReason, example: UnassignedFileReason.GROUP_ROOT })
    @IsEnum(UnassignedFileReason)
    reason: UnassignedFileReason;
}
