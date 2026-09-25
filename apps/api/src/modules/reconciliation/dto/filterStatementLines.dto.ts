import { IsIn, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

export class FilterStatementLinesDto {
    @ApiPropertyOptional({ enum: ['waiting', 'matched', 'ignored'], description: 'Defaults to the lines waiting for a decision' })
    @EmptyToUndefined()
    @IsOptional()
    @IsIn(['waiting', 'matched', 'ignored'])
    state?: 'waiting' | 'matched' | 'ignored';
}
