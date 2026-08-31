import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

/**
 * The optional body of `POST /children/:childId/groups/:groupId`.
 *
 * The route had none, which stopped being fine when E11/S6 gave enrolment a check that refuses once
 * and asks. Without a way to answer, an admin would read "this child is 11 and the group is 7–10"
 * and have no button that gets past it — a warning that cannot be acknowledged is a block wearing
 * the wrong word.
 */
export class AssignToGroupDto {
    /** Confirms the soft checks: an age outside the group's band, today. */
    @ApiPropertyOptional({ default: false })
    @IsOptional()
    @IsBoolean()
    acknowledgeWarnings?: boolean;
}
