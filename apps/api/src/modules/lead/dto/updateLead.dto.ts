import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsOptional, IsPhoneNumber, IsString, Length } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';
import { LeadChannel } from 'src/enum/lead-source.enum';

/**
 * What an admin may change about a lead — E20/S1 and S3.
 *
 * Notice what is **not** here: `status`. Four of the six statuses are consequences of something
 * else — the register, or an enrolment in E11 — and the two that are a person's to declare have
 * endpoints of their own, so that saying "contacted" and saying "lost, because they chose another
 * school" cannot be the same anonymous PATCH. A status field on this DTO would let a screen write
 * `enrolled` on a family nobody enrolled, and S4 counts that field.
 */
export class UpdateLeadDto {
    @ApiPropertyOptional()
    @IsOptional()
    @EmptyToUndefined()
    @IsEmail()
    @Length(3, 255)
    parentEmail?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @EmptyToUndefined()
    @IsPhoneNumber('RO')
    @Length(5, 30)
    parentPhone?: string;

    @ApiPropertyOptional({ enum: LeadChannel })
    @IsOptional()
    @EmptyToUndefined()
    @IsEnum(LeadChannel)
    channel?: LeadChannel;

    @ApiPropertyOptional()
    @IsOptional()
    @EmptyToUndefined()
    @IsString()
    @Length(1, 4000)
    notes?: string;

    /** The date the next step is due. Send `clearNextAction` to remove it — `''` cannot mean "none". */
    @ApiPropertyOptional({ example: '2026-03-01' })
    @IsOptional()
    @EmptyToUndefined()
    @IsDateString()
    nextActionAt?: string;

    @ApiPropertyOptional({ description: 'Removes the follow-up date' })
    @IsOptional()
    @IsBoolean()
    clearNextAction?: boolean;

    /** The admin who answers for this family. `unassign` gives it back to nobody, loudly. */
    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    assignedToId?: number;

    @ApiPropertyOptional({ description: 'Leaves the lead with no owner' })
    @IsOptional()
    @IsBoolean()
    unassign?: boolean;
}
