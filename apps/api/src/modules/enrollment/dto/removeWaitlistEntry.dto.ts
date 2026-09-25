import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { WAITLIST_CLOSING_STATUSES, WaitlistStatus, type WaitlistClosingStatus } from 'src/enum/waitlist-status.enum';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

export class RemoveWaitlistEntryDto {
    /**
     * Why the entry is leaving the list. Three of them mean different things to whoever reads the
     * history later: the family said no, the family never answered, or the school took them off.
     */
    @ApiPropertyOptional({
        enum: WAITLIST_CLOSING_STATUSES,
        default: WaitlistStatus.CANCELLED,
    })
    @EmptyToUndefined()
    @IsOptional()
    @IsIn(WAITLIST_CLOSING_STATUSES)
    status?: WaitlistClosingStatus;
}
