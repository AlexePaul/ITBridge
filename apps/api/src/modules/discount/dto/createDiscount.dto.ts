import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNumber, IsInt, IsNotEmpty, IsOptional, Matches } from 'class-validator';

export class CreateDiscountDto {
    @ApiProperty({ example: 1 })
    @IsInt()
    @IsNotEmpty()
    parentId: number;

    @ApiProperty({ example: 100 })
    @IsNumber()
    @IsNotEmpty()
    value: number;

    @ApiProperty({ example: '2026-01' })
    @IsString()
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'monthIssued must be in YYYY-MM format' })
    @IsNotEmpty()
    monthIssued: string;

    @ApiProperty({ example: 'Refferal' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ example: '100 RON discount pentru recomandare', default: '100 RON discount pentru recomandare' })
    @IsOptional()
    @IsString()
    description?: string;
}
