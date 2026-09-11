import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, MinLength } from 'class-validator';
import { MIN_PASSWORD_LENGTH } from '../password-reset.service';

/** The link's token, and the password to put in its place. */
export class ResetPasswordDto {
    @ApiProperty({ example: 'k3Jx…' })
    @IsString()
    @Length(1, 200)
    token: string;

    @ApiProperty({ example: 'o-parola-noua' })
    @IsString()
    @MinLength(MIN_PASSWORD_LENGTH, { message: `Parola trebuie să aibă cel puțin ${MIN_PASSWORD_LENGTH} caractere` })
    password: string;
}
