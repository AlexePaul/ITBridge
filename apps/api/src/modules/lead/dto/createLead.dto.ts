import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEmail, IsEnum, IsInt, IsOptional, IsPhoneNumber, IsString, Length } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';
import { NormalizePhone } from 'src/common/romanian-phone';
import { LeadChannel, LeadSource } from 'src/enum/lead-source.enum';
import { LEAD_FORM_MESSAGES as MESSAGES } from './lead-form.messages';

/**
 * A lead an admin types in — E20/S1.
 *
 * The second door into the same table, and it is deliberately looser than the public form: somebody
 * on the phone gets what the caller happens to say, in the order they say it. `source` is required
 * here and fixed on the public side, because it is the one thing the person entering the row knows
 * and the form cannot.
 *
 * Every refusal is worded for the office, in Romanian (`lead-form.messages.ts`): „Cerere nouă"
 * prints the server's sentence under the form.
 */
export class CreateLeadDto {
    @ApiProperty({ example: 'Ioana Popescu' })
    @IsString({ message: MESSAGES.parentNameMissing })
    @Length(2, 160, { message: MESSAGES.parentNameLength })
    parentName: string;

    @ApiPropertyOptional({ example: 'ioana.popescu@example.com' })
    @IsOptional()
    @EmptyToUndefined()
    @IsEmail({}, { message: MESSAGES.email })
    @Length(3, 255, { message: MESSAGES.emailLength })
    parentEmail?: string;

    @ApiPropertyOptional({ example: '0712345678' })
    @IsOptional()
    @EmptyToUndefined()
    @NormalizePhone()
    @IsPhoneNumber('RO', { message: MESSAGES.phone })
    @Length(5, 30, { message: MESSAGES.phoneLength })
    parentPhone?: string;

    @ApiProperty({ example: 'Matei' })
    @IsString({ message: MESSAGES.childFirstNameMissing })
    @Length(2, 100, { message: MESSAGES.childFirstNameLength })
    childFirstName: string;

    @ApiProperty({ example: 'Popescu' })
    @IsString({ message: MESSAGES.childLastNameMissing })
    @Length(2, 100, { message: MESSAGES.childLastNameLength })
    childLastName: string;

    @ApiProperty({ example: '2016-04-04' })
    @IsDateString({}, { message: MESSAGES.birthDate })
    childBirthDate: string;

    @ApiPropertyOptional()
    @IsOptional()
    @EmptyToUndefined()
    @IsString({ message: MESSAGES.experience })
    @Length(1, 2000, { message: MESSAGES.experienceLength })
    experience?: string;

    @ApiProperty({ enum: LeadSource, description: 'How the request reached the school' })
    @IsEnum(LeadSource, { message: MESSAGES.source })
    source: LeadSource;

    @ApiPropertyOptional({ enum: LeadChannel })
    @IsOptional()
    @EmptyToUndefined()
    @IsEnum(LeadChannel, { message: MESSAGES.channel })
    channel?: LeadChannel;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsInt({ message: MESSAGES.location })
    locationId?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @EmptyToUndefined()
    @IsString({ message: MESSAGES.notes })
    @Length(1, 4000, { message: MESSAGES.notesLength })
    notes?: string;

    @ApiPropertyOptional({ example: '2026-03-01', description: 'The date the next step is due' })
    @IsOptional()
    @EmptyToUndefined()
    @IsDateString({}, { message: MESSAGES.nextActionAt })
    nextActionAt?: string;
}
