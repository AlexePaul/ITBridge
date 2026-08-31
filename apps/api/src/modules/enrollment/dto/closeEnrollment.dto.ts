import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsString, Length } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';
import { EnrollmentStatus } from 'src/enum/enrollment-status.enum';

export class CloseEnrollmentDto {
    /** One of the three history statuses. Closing something as `ACTIVE` is refused, not ignored. */
    @ApiProperty({ enum: [EnrollmentStatus.COMPLETED, EnrollmentStatus.WITHDRAWN, EnrollmentStatus.TRANSFERRED] })
    @IsEnum(EnrollmentStatus)
    status: EnrollmentStatus;

    @ApiPropertyOptional({ example: 'S-a mutat din oraș' })
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    @Length(1, 500)
    exitReason?: string;

    @ApiPropertyOptional({ example: '2026-12-20' })
    @EmptyToUndefined()
    @IsOptional()
    @IsDateString()
    endDate?: string;
}
