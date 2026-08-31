import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Min } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

/**
 * The agent saying it is alive. E14/S2.
 *
 * The single office computer is a single point of failure whose **silence is ambiguous**: switched
 * off looks exactly like a day when nobody made anything. This is what makes the two
 * distinguishable, and it is the condition on which that risk stays acceptable — not a refinement.
 */
export class AgentHeartbeatDto {
    @ApiProperty({ example: 'birou-straulesti' })
    @IsString()
    @Length(1, 100)
    agentName: string;

    @ApiPropertyOptional({ example: '1.0.0' })
    @IsOptional()
    @EmptyToUndefined()
    @IsString()
    @Length(1, 50)
    version?: string;

    @ApiPropertyOptional({ example: 'P:\\Proiecte' })
    @IsOptional()
    @EmptyToUndefined()
    @IsString()
    @Length(1, 500)
    watchedRoot?: string;

    @ApiPropertyOptional({ example: 0, description: 'Files still waiting in the folder at the last pass' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    pendingFiles?: number;

    @ApiPropertyOptional({ example: 'Share unreachable: \\\\SRV\\Proiecte' })
    @IsOptional()
    @EmptyToUndefined()
    @IsString()
    @Length(1, 2000)
    lastError?: string;
}
