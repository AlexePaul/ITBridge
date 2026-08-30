import { IsOptional, IsString, Length } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

export class RejectAccountDto {
    /**
     * A note for the next admin who looks at this row — "duplicat", "cont de test". It is never
     * sent to the parent, so it can be shorthand.
     *
     * `@EmptyToUndefined()` because it is optional and the form posts `''` when left blank, which
     * `@Length(1, 500)` would otherwise reject — the exact trap CLAUDE.md documents.
     */
    @ApiPropertyOptional({ example: 'duplicat', description: 'Motivul respingerii, doar pentru admini' })
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    @Length(1, 500)
    reason?: string;
}
