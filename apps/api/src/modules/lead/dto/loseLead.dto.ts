import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

/**
 * The written reason a lead ends — E20/S3.
 *
 * Required, not optional, and that is the whole of the story's "no silent exit": a lead leaves the
 * follow-up list because somebody said why, never because enough time passed. A free-text line is
 * enough — an enumeration of reasons would be a guess at a conversation nobody has had yet, and the
 * useful ones ("prea departe", "s-au dus la altă școală", "copilul nu a vrut") are the ones nobody
 * would have listed.
 */
export class LoseLeadDto {
    @ApiProperty({ example: 'Programul nu li se potrivește; poate în toamnă' })
    @IsString()
    @Length(3, 255)
    reason: string;
}
