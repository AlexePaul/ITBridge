import {
    IsEmail,
    IsOptional,
    IsPhoneNumber,
    IsString,
    Length,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserDto {
    @ApiProperty({ example: 'user@example.com', required: false })
    @IsOptional()
    @IsEmail()
    email?: string;

    @ApiProperty({ example: '+40712345678', required: false })
    @IsOptional()
    @IsString()
    @IsPhoneNumber()
    phone?: string;
}
