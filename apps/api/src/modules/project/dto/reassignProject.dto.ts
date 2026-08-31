import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt } from 'class-validator';

/**
 * Move a document to the child it actually belongs to. E14/S7.
 *
 * A file is saved into a folder, and the folder next to it belongs to another child. The mistake
 * turns up in the first month and its consequence is not embarrassment: one child's work, with
 * their name on it, arriving in another family's inbox is a disclosure of personal data.
 *
 * The review before sending is the main defence and it is free — nothing has left while a document
 * is `nou`, and reassigning one costs a click and no re-upload. This is what remains for after.
 */
export class ReassignProjectDto {
    @ApiProperty({ example: 13, description: 'The child the work actually belongs to' })
    @Type(() => Number)
    @IsInt()
    childId: number;
}
