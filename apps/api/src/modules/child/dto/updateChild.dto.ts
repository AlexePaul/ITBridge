import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateChildDto {
    @ApiProperty({ example: 'John' })
    @IsString()
    @IsOptional()
    firstName?: string;

    @ApiProperty({ example: 'Doe' })
    @IsString()
    @IsOptional()
    lastName?: string;

    @ApiProperty({ example: '2015-06-15' })
    @IsDateString()
    @IsOptional()
    birthDate?: string;
}
