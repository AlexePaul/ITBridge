import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty } from 'class-validator';

/**
 * The whole input of the one-press referral reward — E20/S5.
 *
 * One field, and that is the point: the amount, the reason and the month are all fixed by the
 * decision, so anything else here would be a choice the admin does not have to make. If a reward
 * ever needs a different value or a different month, it is not this button — it is the form.
 */
export class GrantReferralDiscountDto {
    @ApiProperty({ example: 1, description: 'The family the reward goes to' })
    @IsInt()
    @IsNotEmpty()
    parentId: number;
}
