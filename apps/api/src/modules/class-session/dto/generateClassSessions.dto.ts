import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';
import { ISO_DATE_MESSAGE, ISO_DATE_PATTERN } from '../class-session.dates';

export class GenerateClassSessionsDto {
    @ApiPropertyOptional({ example: 1, description: 'Generate for this group only. Omit to cover every active group.' })
    @IsOptional()
    @IsInt()
    groupId?: number;

    @ApiPropertyOptional({ example: '2026-09-01', description: 'First day of the horizon. Defaults to today.' })
    @IsOptional()
    @Matches(ISO_DATE_PATTERN, { message: `from ${ISO_DATE_MESSAGE}` })
    from?: string;

    /**
     * Eight weeks is the rolling horizon E12 asks for, and the default nobody has to think about.
     * It is a parameter rather than a constant because generating further ahead — before a holiday,
     * say — is a thing an admin will want, and the alternative is running the job eight times.
     */
    @ApiPropertyOptional({ example: 8, minimum: 1, maximum: 52, description: 'How many weeks ahead. Defaults to 8.' })
    @IsOptional()
    @IsInt()
    @Min(1)
    @Max(52)
    weeks?: number;
}
