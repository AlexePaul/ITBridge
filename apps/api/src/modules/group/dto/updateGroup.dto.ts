import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { createGroupDto } from './createGroup.dto';

/**
 * A partial update: every inherited field is optional.
 *
 * This used to be a hand-written copy of `createGroupDto`, and while validation was switched off
 * nobody noticed that it had no `@IsOptional()` anywhere — turning the pipe on would have rejected
 * every partial update with "startTime must be a string". `PartialType` applies `@IsOptional()` to
 * each inherited field by construction, so the omission cannot come back, and adding a field to
 * the create DTO cannot leave the two shapes out of step.
 */
export class updateGroupDto extends PartialType(createGroupDto) {
    @ApiProperty({ required: false, example: true, description: 'Indicates if the group is active' })
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;
}
