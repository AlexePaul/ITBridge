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

    /*
     * `grantMakeUpCredits` used to be here, and it is gone rather than defaulted — E12/S4.
     *
     * It asked whether every child in the group should be handed a credit for the hour that did not
     * happen. There are no credits to hand out. What replaced the question is two rules that answer
     * it without anybody choosing: a class with no register is billed to nobody (E15/S9), so the
     * family is not paying for a lesson they did not get; and if the week still has a class that
     * fits, the office moves the child into it, which is a placement somebody makes rather than a
     * checkbox somebody ticks while cancelling.
     *
     * The DTO validates with `forbidNonWhitelisted`, so a client still sending the old field gets a
     * 400 rather than being quietly ignored — which is the point of removing it here.
     */
}
