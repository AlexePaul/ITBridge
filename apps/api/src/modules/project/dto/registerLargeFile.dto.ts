import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';
import { ISO_DATE_MESSAGE, ISO_DATE_PATTERN } from 'src/modules/class-session/class-session.dates';
import { MAX_VIDEO_BYTES } from '../file-types';

/**
 * The first half of an upload that never passes through this process. E14/S2.
 *
 * Video, and anything else past the ordinary ceiling, goes straight to S3 through a signed URL.
 * `uploadFile` holds the whole file in memory and the API shares an instance with Postgres: a
 * buffered 200MB upload is not a slow request, it is a dead process. That is an architectural
 * decision rather than a constant, which is why the flow has two steps instead of one.
 *
 * The row is written first and the object arrives afterwards, so a file registered here and never
 * uploaded stays visibly incomplete — it is not shown to a parent and it does not let its project
 * be sent.
 */
export class RegisterLargeFileDto {
    @ApiProperty({ example: 12 })
    @Type(() => Number)
    @IsInt()
    childId: number;

    @ApiProperty({ example: '2026-09-14' })
    @Matches(ISO_DATE_PATTERN, { message: `capturedOn ${ISO_DATE_MESSAGE}` })
    capturedOn: string;

    @ApiProperty({ example: 'prezentare-robot.mp4' })
    @IsString()
    @Length(1, 255)
    originalName: string;

    /**
     * Checked against the ceiling before a URL is issued, and again — as the object's real size —
     * when the upload is confirmed. The first check is a courtesy to the agent; the second is the
     * one that counts, because this number is only a claim.
     */
    @ApiProperty({ example: 48_000_000 })
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(MAX_VIDEO_BYTES)
    sizeBytes: number;

    @ApiProperty({ example: 'a3f1…', description: 'SHA-256 of the file, computed by the agent' })
    @IsString()
    @Matches(/^[a-f0-9]{64}$/, { message: 'contentHash must be a lowercase hex SHA-256' })
    contentHash: string;

    @ApiPropertyOptional({ example: 'Prezentarea robotului' })
    @IsOptional()
    @EmptyToUndefined()
    @IsString()
    @Length(1, 200)
    title?: string;
}
