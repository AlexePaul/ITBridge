import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

export class CreateWaitlistEntryDto {
    @ApiProperty({ example: 1 })
    @Type(() => Number)
    @IsInt()
    childId: number;

    @ApiProperty({ example: 2 })
    @Type(() => Number)
    @IsInt()
    groupId: number;

    /** Anything the next admin should know — "vrea doar marțea", "sună după 17". */
    @ApiPropertyOptional({ example: 'Sună după ora 17' })
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    @Length(1, 500)
    note?: string;
}
