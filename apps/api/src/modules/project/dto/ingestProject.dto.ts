import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Matches } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';
import { ISO_DATE_MESSAGE, ISO_DATE_PATTERN } from 'src/modules/class-session/class-session.dates';

/**
 * What the agent sends with a file. E14/S2.
 *
 * Multipart, so every field arrives as a string and every numeric one needs `@Type(() => Number)` —
 * `enableImplicitConversion` is off globally, deliberately, so `"12"` would otherwise fail `@IsInt`.
 */
export class IngestProjectDto {
    @ApiProperty({ example: 12, description: 'The child whose folder the file was found in' })
    @Type(() => Number)
    @IsInt()
    childId: number;

    @ApiProperty({ example: '2026-09-14', description: 'The day the work was done, from the folder the agent read' })
    @Matches(ISO_DATE_PATTERN, { message: `capturedOn ${ISO_DATE_MESSAGE}` })
    capturedOn: string;

    /**
     * SHA-256 of the bytes, computed by the agent. Recomputed here rather than trusted: it is what
     * makes an upload idempotent, so a client that got it wrong — or a file that changed between
     * hashing and reading — must not be able to claim somebody else's key.
     */
    @ApiPropertyOptional({ example: 'a3f1…', description: 'SHA-256 the agent computed; verified against the bytes' })
    @IsOptional()
    @IsString()
    @Matches(/^[a-f0-9]{64}$/, { message: 'contentHash must be a lowercase hex SHA-256' })
    contentHash?: string;

    @ApiPropertyOptional({ example: 'Robotul care evită obstacole' })
    @IsOptional()
    @EmptyToUndefined()
    @IsString()
    @Length(1, 200)
    title?: string;

    @ApiPropertyOptional({ example: 'A doua variantă, cu senzor de distanță' })
    @IsOptional()
    @EmptyToUndefined()
    @IsString()
    @Length(1, 2000)
    description?: string;

    /**
     * Add to an existing project as a new version instead of starting a new one. The agent sets it
     * when the file lands in a folder it has already uploaded from that day; an admin sets it from
     * the screen. Absent means "a project of its own".
     */
    @ApiPropertyOptional({ example: 41, description: 'Existing project to add this file to as a new version' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    projectId?: number;
}
