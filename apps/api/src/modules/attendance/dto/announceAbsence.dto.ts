import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Length } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

/** A parent saying which child will miss which class, and why — E12/S3. */
export class AnnounceAbsenceDto {
    @ApiProperty({ example: 1 })
    @IsInt()
    childId: number;

    @ApiProperty({ example: 12, description: 'The class being missed' })
    @IsInt()
    classSessionId: number;

    /**
     * Required, and not optional, for the same reason a cancellation's reason is: „nu a spus de ce"
     * is an answer nobody can act on, and the whole point of a notice over a silence is that it
     * carries something. Three characters keeps „x" out without demanding an essay.
     */
    @ApiProperty({ example: 'Răcit, îl ținem acasă' })
    @EmptyToUndefined()
    @IsString()
    @Length(3, 500)
    reason: string;
}
