import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { WaitlistStatus } from 'src/enum/waitlist-status.enum';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

export class RemoveWaitlistEntryDto {
    /**
     * Why the entry is leaving the list. Three of them mean different things to whoever reads the
     * history later: the family said no, the family never answered, or the school took them off.
     */
    @ApiPropertyOptional({
        enum: [WaitlistStatus.DECLINED, WaitlistStatus.EXPIRED, WaitlistStatus.CANCELLED],
        default: WaitlistStatus.CANCELLED,
    })
    @EmptyToUndefined()
    @IsOptional()
    @IsEnum(WaitlistStatus)
    status?: WaitlistStatus;
}
