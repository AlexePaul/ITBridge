import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, Matches } from 'class-validator';

export class UpdateDiscountDto {
    @ApiPropertyOptional({ example: 100 })
    @IsOptional()
    @IsNumber()
    value?: number;

    @ApiPropertyOptional({ example: '2026-01' })
    @IsOptional()
    @IsString()
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'monthIssued must be in YYYY-MM format' })
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
