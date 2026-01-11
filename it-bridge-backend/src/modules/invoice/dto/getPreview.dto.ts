import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNumber, IsString } from 'class-validator';

export class GetPreviewDto {
    @ApiProperty({ example: [1, 2, 3] })
    @IsArray()
    @IsNumber({}, { each: true })
    parentIds: number[];

    @ApiProperty({ example: '2026-01' })
    @IsString()
    monthIssued: string;
}
