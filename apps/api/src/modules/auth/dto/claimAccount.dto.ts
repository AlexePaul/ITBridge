import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsBoolean, IsString, Length, MinLength } from 'class-validator';
import { Trim } from 'src/common/trim';
import { MIN_PASSWORD_LENGTH } from '../password-reset.service';

/**
 * What a family the office typed in sends to create its own account: the link's token, and what
 * `RegisterDto` asks for an account — minus the name and the address, which the office already
 * holds and the link has just proved. Same rules for the username, the password and both checkboxes,
 * so there is no easier way into an account than registering.
 */
export class ClaimAccountDto {
    @ApiProperty({ example: 'k3Jx…' })
    @IsString()
    @Length(1, 200)
    token: string;

    @ApiProperty({ example: 'username123' })
    @Trim()
    @IsString()
    @Length(1, 30, { message: 'Numele de utilizator trebuie să aibă între 1 și 30 de caractere' })
    username: string;

    @ApiProperty({ example: 'password123', minLength: MIN_PASSWORD_LENGTH })
    @IsString()
    @MinLength(MIN_PASSWORD_LENGTH, { message: `Parola trebuie să aibă cel puțin ${MIN_PASSWORD_LENGTH} caractere` })
    password: string;

    /** The terms and the privacy notice — refused as anything but `true`, as at registration (E22 S2/S4). */
    @ApiProperty({ example: true })
    @IsBoolean()
    @Equals(true, { message: 'Termenii și politica de confidențialitate trebuie acceptate' })
    acceptedTerms: boolean;

    /** The unusual clauses of the terms, accepted expressly and separately — Cod civil art. 1203. */
    @ApiProperty({ example: true })
    @IsBoolean()
    @Equals(true, { message: 'Clauzele din §14, §15 și §18 trebuie acceptate separat' })
    acceptedUnusualClauses: boolean;
}
