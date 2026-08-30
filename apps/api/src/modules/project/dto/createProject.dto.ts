import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, IsUrl, Length, Matches, ValidateNested } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';
import { ISO_DATE_MESSAGE, ISO_DATE_PATTERN } from 'src/modules/class-session/class-session.dates';

/**
 * One link on a project: a Tinkercad model, a Canva design, a page the child built.
 *
 * `IsUrl` with an explicit protocol list, and the list is the point. The value is rendered as an
 * anchor in the parent's portal, so a `javascript:` URL — which a `.url` file on a share any machine
 * in the school can write to could carry — would be script execution on the school's own domain,
 * triggered by a parent clicking their child's work.
 */
export class ProjectLinkDto {
    @ApiProperty({ example: 'Macheta în Tinkercad' })
    @IsString()
    @Length(1, 200)
    label: string;

    @ApiProperty({ example: 'https://www.tinkercad.com/things/abc123' })
    @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
    @Length(1, 2048)
    url: string;
}

/**
 * A project added by hand from the group screen. E14/S2: the agent is the main road, not the only
 * one — nothing that lives online is a file anyone saves into a folder.
 */
export class CreateProjectDto {
    @ApiProperty({ example: 12 })
    @Type(() => Number)
    @IsInt()
    childId: number;

    @ApiProperty({ example: '2026-09-14' })
    @Matches(ISO_DATE_PATTERN, { message: `capturedOn ${ISO_DATE_MESSAGE}` })
    capturedOn: string;

    @ApiProperty({ example: 'Orașul din Tinkercad' })
    @IsString()
    @Length(1, 200)
    title: string;

    @ApiPropertyOptional({ example: 'Prima machetă 3D' })
    @IsOptional()
    @EmptyToUndefined()
    @IsString()
    @Length(1, 2000)
    description?: string;

    /**
     * At least one is required, and the service is what enforces it — "this array is non-empty"
     * cannot be stated on a column, and a project with neither a file nor a link is a row that says
     * a child made something without being able to show it.
     */
    @ApiProperty({ type: [ProjectLinkDto] })
    @IsArray()
    @ArrayMaxSize(10)
    @ValidateNested({ each: true })
    @Type(() => ProjectLinkDto)
    links: ProjectLinkDto[];
}
