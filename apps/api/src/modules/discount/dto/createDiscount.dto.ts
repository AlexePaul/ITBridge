import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsInt, IsNotEmpty, IsOptional, IsEnum, Matches, Min } from 'class-validator';
import { DiscountType } from 'src/enum/discount-type.enum';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

export class CreateDiscountDto {
    @ApiProperty({ example: 1 })
    @IsInt()
    @IsNotEmpty()
    parentId: number;

    @ApiPropertyOptional({ enum: DiscountType, description: 'Lei off, or per cent off. Defaults to lei.' })
    @EmptyToUndefined()
    @IsOptional()
    @IsEnum(DiscountType)
    type?: DiscountType;

    /**
     * Lei or per cent, according to `type`. The 0–100 cap on a percentage is enforced in the
     * service, not here: an update can change the type and the value in separate requests, so only
     * the service sees the combination that ends up stored.
     */
    @ApiProperty({ example: 50, description: 'Lei, or per cent when type is percent (0–100)' })
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    value: number;

    @ApiProperty({ example: '2026-01' })
    @IsString()
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'monthIssued must be in YYYY-MM format' })
    @IsNotEmpty()
    monthIssued: string;

    @ApiProperty({ example: 'Recomandare' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiPropertyOptional({ example: 'A recomandat familia Ionescu' })
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    description?: string;
}
