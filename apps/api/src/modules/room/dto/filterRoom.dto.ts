import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional } from 'class-validator';

export class FilterRoomDto {
    // `@Type(() => Number)` is required, not decorative: `enableImplicitConversion` is off, so a
    // query string arrives as `"1"` and `@IsInt()` would reject it.
    @ApiProperty({ required: false, example: 1, description: 'Only the rooms of this location' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    locationId?: number;
}
