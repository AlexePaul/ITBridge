import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
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
    @Type(() => Number)
    @IsNumber()
    @IsOptional()
    parentId?: number;

    @ApiProperty({ example: 1, required: false })
    @Type(() => Number)
    @IsNumber()
    @IsOptional()
    childId?: number;
}
