import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

export class FilterChildDto {
    @ApiProperty({ example: 'John', required: false })
    @EmptyToUndefined()
    @IsString()
    @IsOptional()
    firstName?: string;

    @ApiProperty({ example: 'Doe', required: false })
    @EmptyToUndefined()
    @IsString()
    @IsOptional()
    lastName?: string;

    @ApiProperty({ example: 1, required: false })
    @EmptyToUndefined()
    @Type(() => Number)
    @IsNumber()
    @IsOptional()
    parentId?: number;

    @ApiProperty({ example: 1, required: false })
    @EmptyToUndefined()
    @Type(() => Number)
    @IsNumber()
    @IsOptional()
    childId?: number;
}
