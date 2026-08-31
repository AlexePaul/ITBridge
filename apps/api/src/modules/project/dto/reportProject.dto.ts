import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

/**
 * A parent saying "this does not look like my child's work". E14/S7.
 *
 * **The parent reports; they do not delete.** The reason is architectural rather than polite: the
 * `PARENT_WRITABLE` list in `authorization.spec.ts` enumerates exactly what a parent may write, and
 * everything else requires `ADMIN`. A parent deleting a `Project` outright would need a new
 * exception in that list — which is the intention the list exists to protect.
 */
export class ReportProjectDto {
    @ApiPropertyOptional({ example: 'Nu e lucrarea copilului meu, e a altcuiva din grupă.' })
    @IsOptional()
    @EmptyToUndefined()
    @IsString()
    @Length(1, 1000)
    note?: string;
}
