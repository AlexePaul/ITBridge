import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsEmail, Length, IsString, IsPhoneNumber, IsNumber } from 'class-validator';

export class FilterProfileDto {
    @ApiPropertyOptional({ example: 'user@example.com', required: false })
    @IsOptional()
    @IsEmail()
    email?: string;

    @ApiPropertyOptional({ example: '+40712345678', required: false })
    @IsOptional()
    @IsString()
    @IsPhoneNumber()
    phone?: string;

    @ApiPropertyOptional({ example: 'John', required: false })
    @IsOptional()
    @IsString()
    @Length(1, 100)
    firstName?: string;

    @ApiPropertyOptional({ example: 'Doe', required: false })
    @IsOptional()
    @IsString()
    @Length(1, 100)
    lastName?: string;

    @ApiPropertyOptional({ example: 1, required: false })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    profileId?: number;

    @ApiPropertyOptional({ example: 1, required: false, description: 'User ID' })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    userId?: number;
}
