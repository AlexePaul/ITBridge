import { ApiProperty } from '@nestjs/swagger';
import { IsInt } from 'class-validator/types/decorator/typechecker/IsInt';
import { IsString } from 'class-validator/types/decorator/typechecker/IsString';

export class GetPreviewDto {
    @ApiProperty({ example: 1 })
    @IsInt()
    parentId: number;

    @ApiProperty({ example: '2026-01' })
    @IsString()
    monthIssued: string;
}
