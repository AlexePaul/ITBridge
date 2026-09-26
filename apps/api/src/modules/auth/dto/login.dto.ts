import { IsString, Length, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Trim } from 'src/common/trim';

export class LoginDto {
    @ApiProperty({ example: 'username123' })
    @Trim()
    @IsString()
    @Length(1, 30, { message: 'Numele de utilizator trebuie să aibă între 1 și 30 de caractere' })
    username: string;

    @ApiProperty({ example: 'password123', minLength: 6 })
    @IsString()
    @MinLength(6, { message: 'Parola trebuie să aibă cel puțin 6 caractere' })
    password: string;
}
