import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { MIN_PASSWORD_LENGTH } from '../password-reset.service';

/**
 * Changing the password from inside the account.
 *
 * `currentPassword` is required and is not ceremony: an access token lives fifteen minutes and
 * `AuthGuard` honours it without consulting `sessions`, so a borrowed phone is enough to reach this
 * route. What only the owner knows is what stops the change being available to whoever has the tab.
 */
export class ChangePasswordDto {
    @ApiProperty({ example: 'parola-actuala' })
    @IsString()
    currentPassword: string;

    @ApiProperty({ example: 'o-parola-noua' })
    @IsString()
    @MinLength(MIN_PASSWORD_LENGTH, { message: `Parola trebuie să aibă cel puțin ${MIN_PASSWORD_LENGTH} caractere` })
    newPassword: string;
}
