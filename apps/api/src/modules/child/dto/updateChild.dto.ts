import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString, Length, Matches } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';
import { ISO_DATE_PATTERN } from 'src/modules/class-session/class-session.dates';

/**
 * A correction to a child's name or birth date — from the office, or from the family in Profil
 * (terms §6: „să adaugi sau să corectezi copiii"). The same rules and the same Romanian sentences as
 * `CreateChildDto`; a field left out, or left empty, stays as it was.
 */
export class UpdateChildDto {
    @ApiProperty({ example: 'Matei' })
    @EmptyToUndefined()
    @IsString({ message: 'Scrie prenumele copilului' })
    @Length(1, 100, { message: 'Prenumele copilului trebuie să aibă între 1 și 100 de caractere' })
    @IsOptional()
    firstName?: string;

    @ApiProperty({ example: 'Popescu' })
    @EmptyToUndefined()
    @IsString({ message: 'Scrie numele de familie al copilului' })
    @Length(1, 100, { message: 'Numele de familie al copilului trebuie să aibă între 1 și 100 de caractere' })
    @IsOptional()
    lastName?: string;

    @ApiProperty({ example: '2015-06-15', description: 'A day, `YYYY-MM-DD`, not after today' })
    @EmptyToUndefined()
    @Matches(ISO_DATE_PATTERN, { message: 'Data nașterii nu pare validă' })
    @IsDateString({ strict: true }, { message: 'Data nașterii nu pare validă' })
    @IsOptional()
    birthDate?: string;
}
