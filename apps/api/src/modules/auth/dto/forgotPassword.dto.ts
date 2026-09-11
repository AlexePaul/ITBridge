import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

/**
 * Asking for a reset link.
 *
 * The address and nothing else. No username: a parent who has forgotten their password has usually
 * forgotten which of two usernames they picked, and asking for both would turn a recovery form into
 * a quiz.
 */
export class ForgotPasswordDto {
    @ApiProperty({ example: 'ana.popescu@example.com' })
    @IsEmail({}, { message: 'Adresa de email nu este validă' })
    email: string;
}
