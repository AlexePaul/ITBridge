import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, ArrayUnique, IsArray, IsNumber, IsString, Matches } from 'class-validator';

export class GetPreviewDto {
    @ApiProperty({ example: [1, 2, 3] })
    @IsArray()
    @ArrayNotEmpty()
    // Same rule as CreateInvoiceDto. Without it the preview happily rendered a duplicated parent
    // and the create call that follows with the identical array then failed with 400.
    @ArrayUnique()
    @IsNumber({}, { each: true })
    parentIds: number[];

    @ApiProperty({ example: '2026-01' })
    @IsString()
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'monthIssued must be in YYYY-MM format' })
    monthIssued: string;
}
