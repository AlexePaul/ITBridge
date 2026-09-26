import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

export class MoveChildToFamilyDto {
    @ApiProperty({ example: 12, description: 'The family the child belongs with' })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    profileId: number;
}
