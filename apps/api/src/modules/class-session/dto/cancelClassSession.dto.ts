import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

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

    /**
     * Whether every child in the group gets the hour back — E12/S5.
     *
     * Asked rather than assumed, because it is a pricing decision and the two common cases differ.
     * The invoice counts sessions held, so a cancelled class already costs the family nothing; a
     * make-up on top gives them a fourth lesson for three lessons' money. Worth it for a teacher
     * who fell ill, arguably not for a snowed-out Tuesday — and only the person cancelling knows
     * which one this is.
     *
     * Defaults to false: the sentence in the parent's email changes with it, and the message that
     * promises nothing is the one that cannot promise wrongly.
     */
    @ApiPropertyOptional({ description: 'Grant every child in the group a make-up credit for the cancelled hour', default: false })
    @IsOptional()
    @IsBoolean()
    grantMakeUpCredits?: boolean;
}
