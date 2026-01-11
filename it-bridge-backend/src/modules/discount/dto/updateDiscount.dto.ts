import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, IsInt, Min, Max, IsNotEmpty } from 'class-validator';

export class UpdateDiscountDto {
    @ApiPropertyOptional({ example: 100 })
    @IsOptional()
    @IsNumber()
    value?: number;

    @ApiPropertyOptional({ example: '2026-01' })
    @IsOptional()
    @IsString()
    monthIssued?: string;

    @ApiPropertyOptional({ example: 'Recomandare' })
    @IsOptional()
    @IsString()
    name?: string;

    @ApiPropertyOptional({ example: '100 RON discount pentru recomandare' })
    @IsOptional()
    @IsString()
    description?: string;
}
