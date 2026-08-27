import { ApiProperty } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsNumber, IsString, Matches } from 'class-validator';

export class GetPreviewDto {
    @ApiProperty({ example: [1, 2, 3] })
    @IsArray()
    @ArrayNotEmpty()
    @IsNumber({}, { each: true })
    parentIds: number[];

    @ApiProperty({ example: '2026-01' })
    @IsString()
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'monthIssued must be in YYYY-MM format' })
    monthIssued: string;
}
