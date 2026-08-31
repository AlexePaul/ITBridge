import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsInt } from 'class-validator';

/**
 * What an admin ticked before pressing send. E14/S4, E17/S8.
 *
 * A list of documents rather than a group id: the review is the point of the button, and "send
 * everything in this group" would be the evening job the epic decided against — the moment somebody
 * takes responsibility for what leaves is the moment they choose the rows.
 *
 * The ceiling is generous rather than tight. A group is about ten children, so a realistic press is
 * ten to twenty documents; a hundred means something is being done that this screen is not for.
 */
export class SendProjectsDto {
    @ApiProperty({ example: [41, 42, 43] })
    @IsArray()
    @ArrayMinSize(1)
    @ArrayMaxSize(100)
    @Type(() => Number)
    @IsInt({ each: true })
    projectIds: number[];
}
