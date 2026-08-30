import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString, Length } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

export class ResolveTrialDto {
    /** `true` turns the trial into a real enrolment; `false` closes it and frees the seat. */
    @ApiProperty({ example: true })
    @IsBoolean()
    accepted: boolean;

    /** Why the family did not continue. Only meaningful when `accepted` is false. */
    @ApiPropertyOptional({ example: 'Nu s-a potrivit programul' })
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    @Length(1, 500)
    reason?: string;

    @ApiPropertyOptional({ example: '2026-09-14' })
    @EmptyToUndefined()
    @IsOptional()
    @IsDateString()
    contractSignedAt?: string;
}
