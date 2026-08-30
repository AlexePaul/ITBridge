import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Matches } from 'class-validator';
import { ProjectStatus } from 'src/enum/project-status.enum';
import { ISO_DATE_MESSAGE, ISO_DATE_PATTERN } from 'src/modules/class-session/class-session.dates';

export class FilterProjectDto {
    @ApiPropertyOptional({ example: 3, description: 'Everything by the children currently in this group' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    groupId?: number;

    @ApiPropertyOptional({ example: 12 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    childId?: number;

    @ApiPropertyOptional({ enum: ProjectStatus, example: ProjectStatus.NEW })
    @IsOptional()
    @IsEnum(ProjectStatus)
    status?: ProjectStatus;

    @ApiPropertyOptional({ example: '2026-09-01', description: 'First day of the interval, inclusive' })
    @IsOptional()
    @Matches(ISO_DATE_PATTERN, { message: `dateFrom ${ISO_DATE_MESSAGE}` })
    dateFrom?: string;

    @ApiPropertyOptional({ example: '2026-09-30', description: 'Last day of the interval, inclusive' })
    @IsOptional()
    @Matches(ISO_DATE_PATTERN, { message: `dateTo ${ISO_DATE_MESSAGE}` })
    dateTo?: string;
}
