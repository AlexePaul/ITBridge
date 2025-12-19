import { IsEmail, IsOptional, IsPhoneNumber, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateParentProfileDto {
    @ApiProperty({ example: 'user@example.com', required: false })
    @IsOptional()
    @IsEmail()
    email?: string;

    @ApiProperty({ example: '+40712345678', required: false })
    @IsOptional()
    @IsString()
    @IsPhoneNumber()
    phone?: string;

    @ApiProperty({ example: 'John' })
    @IsString()
    @Length(1, 100)
    firstName: string;

    @ApiProperty({ example: 'Doe' })
    @IsString()
    @Length(1, 100)
    lastName: string;

    @ApiProperty({ example: '123 Main St', required: false })
    @IsOptional()
    @IsString()
    @Length(1, 255)
    address?: string;
}
