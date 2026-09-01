import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber, IsEnum, Matches, Min } from 'class-validator';
import { DiscountType } from 'src/enum/discount-type.enum';

export class UpdateDiscountDto {
    @ApiPropertyOptional({ enum: DiscountType })
    @IsOptional()
    @IsEnum(DiscountType)
    type?: DiscountType;

    @ApiPropertyOptional({ example: 50 })
    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
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
