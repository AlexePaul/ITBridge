import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

export class UpdateChildDto {
    @ApiProperty({ example: 'John' })
    @EmptyToUndefined()
    @IsString()
    @IsOptional()
    firstName?: string;

    @ApiProperty({ example: 'Doe' })
    @EmptyToUndefined()
    @IsString()
    @IsOptional()
    lastName?: string;

    @ApiProperty({ example: '2015-06-15' })
    @EmptyToUndefined()
    @IsDateString()
    @IsOptional()
    birthDate?: string;
}
