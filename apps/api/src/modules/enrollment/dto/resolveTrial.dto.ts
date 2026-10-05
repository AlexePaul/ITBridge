import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsOptional, IsString, Length, ValidateIf } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

export class ResolveTrialDto {
    /** `true` turns the trial into a real enrolment; `false` closes it and frees the seat. */
    @ApiProperty({ example: true })
    @IsBoolean()
    accepted: boolean;

    /**
     * Why the family did not continue — **required** when `accepted` is false, as on the lead's own
     * "Pierdut" (E20/S3, "no silent exit"). `/admin/formare` closed a trial in one tap and wrote a
     * canned "Proba nu s-a transformat în înscriere" on the lead, so the funnel learned nothing (QA of
     * 27 September 2026). At most 255 characters: it is copied to `Lead.lostReason`, whose column is
     * that long — the 500 allowed here before ended in a 500 from the driver.
     */
    @ApiPropertyOptional({ example: 'Nu s-a potrivit programul' })
    @EmptyToUndefined()
    @ValidateIf((dto: ResolveTrialDto) => dto.accepted === false || dto.reason !== undefined)
    @IsString({ message: 'Scrie de ce nu continuă familia: motivul rămâne pe cerere și în raportul pâlniei.' })
    @Length(3, 255, { message: 'Motivul trebuie să aibă între 3 și 255 de caractere' })
    reason?: string;

    @ApiPropertyOptional({ example: '2026-09-14' })
    @EmptyToUndefined()
    @IsOptional()
    @IsDateString()
    contractSignedAt?: string;
}
