import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsInt, IsString, Length, Matches } from 'class-validator';
import { Trim } from 'src/common/trim';
import { ISO_DATE_PATTERN } from 'src/modules/class-session/class-session.dates';

/**
 * A child added to a family — by the office from the family's page, or by the family itself from
 * Profil (terms §5 and §6, privacy notice §8).
 *
 * **Every refusal a parent can cause is worded for a parent, in Romanian**, like `BookTrialDto`:
 * the portal shows the server's sentence, so the validator's English must never be the sentence it
 * has. The names are trimmed before they are measured — a phone keyboard adds a space after a word
 * it completed, and a name of spaces is not a name. The column is `varchar(100)`, so a longer one was
 * a 500 from the driver.
 *
 * The birth date is a day, `YYYY-MM-DD`, and nothing else: `@IsDateString()` alone takes a full
 * timestamp too, which Postgres then turns into a day on its own clock. A day after today is refused
 * by the service (`BIRTH_DATE_IN_FUTURE`), which has the school's clock to ask.
 */
export class CreateChildDto {
    @ApiProperty({ example: 'Matei' })
    @Trim()
    @IsString({ message: 'Scrie prenumele copilului' })
    @Length(1, 100, { message: 'Prenumele copilului trebuie să aibă între 1 și 100 de caractere' })
    firstName: string;

    @ApiProperty({ example: 'Popescu' })
    @Trim()
    @IsString({ message: 'Scrie numele de familie al copilului' })
    @Length(1, 100, { message: 'Numele de familie al copilului trebuie să aibă între 1 și 100 de caractere' })
    lastName: string;

    @ApiProperty({ example: '2015-06-15', description: 'A day, `YYYY-MM-DD`, not after today' })
    @Matches(ISO_DATE_PATTERN, { message: 'Data nașterii nu pare validă' })
    @IsDateString({ strict: true }, { message: 'Data nașterii nu pare validă' })
    birthDate: string;

    @ApiProperty({ example: 1, description: 'The family the child belongs to. A parent may only name their own.' })
    @IsInt()
    parentId: number;
}
