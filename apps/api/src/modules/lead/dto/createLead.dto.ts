import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEmail, IsEnum, IsInt, IsOptional, IsPhoneNumber, IsString, Length } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';
import { LeadChannel, LeadSource } from 'src/enum/lead-source.enum';

/**
 * A lead an admin types in — E20/S1.
 *
 * The second door into the same table, and it is deliberately looser than the public form: somebody
 * on the phone gets what the caller happens to say, in the order they say it. `source` is required
 * here and fixed on the public side, because it is the one thing the person entering the row knows
 * and the form cannot.
 */
export class CreateLeadDto {
    @ApiProperty({ example: 'Ioana Popescu' })
    @IsString()
    @Length(2, 160)
    parentName: string;

    @ApiPropertyOptional({ example: 'ioana.popescu@example.com' })
    @IsOptional()
    @EmptyToUndefined()
    @IsEmail()
    @Length(3, 255)
    parentEmail?: string;

    @ApiPropertyOptional({ example: '0712345678' })
    @IsOptional()
    @EmptyToUndefined()
    @IsPhoneNumber('RO')
    @Length(5, 30)
    parentPhone?: string;

    @ApiProperty({ example: 'Matei' })
    @IsString()
    @Length(2, 100)
    childFirstName: string;

    @ApiProperty({ example: 'Popescu' })
    @IsString()
    @Length(2, 100)
    childLastName: string;

    @ApiProperty({ example: '2016-04-04' })
    @IsDateString()
    childBirthDate: string;

    @ApiPropertyOptional()
    @IsOptional()
    @EmptyToUndefined()
    @IsString()
    @Length(1, 2000)
    experience?: string;

    @ApiProperty({ enum: LeadSource, description: 'How the request reached the school' })
    @IsEnum(LeadSource)
    source: LeadSource;

    @ApiPropertyOptional({ enum: LeadChannel })
    @IsOptional()
    @EmptyToUndefined()
    @IsEnum(LeadChannel)
    channel?: LeadChannel;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    locationId?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @EmptyToUndefined()
    @IsString()
    @Length(1, 4000)
    notes?: string;

    @ApiPropertyOptional({ example: '2026-03-01', description: 'The date the next step is due' })
    @IsOptional()
    @EmptyToUndefined()
    @IsDateString()
    nextActionAt?: string;
}
