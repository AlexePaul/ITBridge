import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class FilterChildDto {
    @ApiProperty({ example: 'John', required: false })
    @IsString()
    @IsOptional()
    firstName?: string;

    @ApiProperty({ example: 'Doe', required: false })
    @IsString()
    @IsOptional()
    lastName?: string;

    @ApiProperty({ example: 1, required: false })
    @IsNumber()
    @IsOptional()
    parentId?: number;

    @ApiProperty({ example: 1, required: false })
    @IsNumber()
    @IsOptional()
    childId?: number;
}
