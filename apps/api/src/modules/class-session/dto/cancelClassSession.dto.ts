import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';

export class CancelClassSessionDto {
    /**
     * Required, and not `@IsOptional()`. A cancelled class is something a parent will ask about,
     * and "the reason was not recorded" is the answer nobody can act on.
     * Three characters is enough to keep "x" and "-" out without demanding an essay.
     */
    @ApiProperty({ example: 'Profesor bolnav', description: 'Why the class is not happening. Shown in the timetable.' })
    @IsString()
    @Length(3, 500)
    reason: string;
}
