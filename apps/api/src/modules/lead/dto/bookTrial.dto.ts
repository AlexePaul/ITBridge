import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsEmail, IsEnum, IsInt, IsOptional, IsPhoneNumber, IsString, Length } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';
import { LeadChannel } from 'src/enum/lead-source.enum';

/**
 * What a parent fills in on the public booking form — E20/S2.
 *
 * The shortest form that still produces something the school can act on: who you are, one way to
 * reach you, the child's name and birth date, and the class you picked. Everything else is optional,
 * because every required field on a public form is a family that closes the tab.
 *
 * `@EmptyToUndefined()` on every optional text field, and not as a formality: an untyped HTML input
 * posts `''`, which `@IsOptional()` does not skip, so `@IsOptional() @Length(1, …)` would reject
 * exactly the payload the form produces every time — the bug that made the profile screen
 * impossible to get past.
 *
 * **No honeypot field here.** The API has a real rate limiter in front of it (E05/S6), which the
 * Nitro contact route did not; the trap that belongs on the page belongs on the page, and a hidden
 * input in the API contract would suggest the check happens in a place it does not.
 */
export class BookTrialDto {
    @ApiProperty({ example: 'Ioana Popescu' })
    @IsString()
    @Length(2, 160)
    parentName: string;

    /**
     * One of email or phone is required, and the service is what enforces it — a rule about two
     * fields together has no single field to hang a decorator on.
     */
    @ApiPropertyOptional({ example: 'ioana.popescu@example.com' })
    @IsOptional()
    @EmptyToUndefined()
    @IsEmail({}, { message: 'Adresa de email nu pare validă' })
    @Length(3, 255)
    parentEmail?: string;

    @ApiPropertyOptional({ example: '0712345678' })
    @IsOptional()
    @EmptyToUndefined()
    @IsPhoneNumber('RO', { message: 'Numărul de telefon nu pare valid' })
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

    @ApiProperty({ example: '2016-04-04', description: "The child's birth date; the age it implies decides which groups are offered" })
    @IsDateString()
    childBirthDate: string;

    @ApiPropertyOptional({ example: 'A făcut Scratch la școală, altfel nimic' })
    @IsOptional()
    @EmptyToUndefined()
    @IsString()
    @Length(1, 2000)
    experience?: string;

    @ApiPropertyOptional({ enum: LeadChannel, description: 'Where the family says they heard about the school. Self-declared, never inferred.' })
    @IsOptional()
    @EmptyToUndefined()
    @IsEnum(LeadChannel)
    channel?: LeadChannel;

    @ApiPropertyOptional({ description: 'Which address the family is asking about' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    locationId?: number;

    /**
     * The class picked from the offered list. Absent means the parent found no hour that suited —
     * the request is kept as a lead with no trial rather than thrown away, which is S2's rule about
     * never ending in an error message.
     */
    @ApiPropertyOptional({ description: 'The class session to book. Leave it out to say "no suitable hour" and still be contacted.' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    classSessionId?: number;
}
