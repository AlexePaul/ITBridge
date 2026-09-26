import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { ERASURE_REQUEST_CHANNELS, type ErasureRequestChannel } from '../erasure.service';

/** How the request reached the office — kept in the trail, so a reader knows it wasn't the portal. */
export class RecordErasureRequestDto {
    @ApiProperty({ enum: ERASURE_REQUEST_CHANNELS, example: 'phone' })
    @IsIn(ERASURE_REQUEST_CHANNELS)
    via!: ErasureRequestChannel;
}
