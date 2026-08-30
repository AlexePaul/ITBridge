import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';
import { EnrollmentStatus } from 'src/enum/enrollment-status.enum';

export class CreateEnrollmentDto {
    @ApiProperty({ example: 1 })
    @Type(() => Number)
    @IsInt()
    childId: number;

    @ApiProperty({ example: 2 })
    @Type(() => Number)
    @IsInt()
    groupId: number;

    /**
     * `ACTIVE` unless a trial is asked for. Only the two in-force statuses are accepted here — a
     * closed enrolment is something you arrive at, not something you open.
     */
    @ApiPropertyOptional({ enum: [EnrollmentStatus.ACTIVE, EnrollmentStatus.TRIAL], default: EnrollmentStatus.ACTIVE })
    @EmptyToUndefined()
    @IsOptional()
    @IsEnum(EnrollmentStatus)
    status?: EnrollmentStatus;

    /** Defaults to today, in the school's timezone. Backdating is allowed; an admin fixing an omission needs it. */
    @ApiPropertyOptional({ example: '2026-09-15' })
    @EmptyToUndefined()
    @IsOptional()
    @IsDateString()
    startDate?: string;

    /** The date on the paper contract — E11/D3. The platform stores the fact, not the document. */
    @ApiPropertyOptional({ example: '2026-09-14' })
    @EmptyToUndefined()
    @IsOptional()
    @IsDateString()
    contractSignedAt?: string;

    /**
     * The explicit exception to the capacity rule (S3). Never a default, and it leaves a warning in
     * the log naming the admin — an eleventh chair in a room of ten is not a judgement call, so it
     * must not be possible by accident.
     */
    @ApiPropertyOptional({ default: false })
    @IsOptional()
    @IsBoolean()
    allowOverCapacity?: boolean;
}
