import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/** One child's mark, for the tap-to-mark screen — E12/S6. Which class and which child are the path. */
export class UpsertMarkDto {
    @ApiProperty({ example: true, description: 'Present or absent' })
    @IsBoolean()
    present: boolean;
}
