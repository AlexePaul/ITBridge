import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

/**
 * The caller's own refresh token, optional — only so the list can mark which session is this one
 * (terms §4.5). It travels in a body, like `logout`'s, rather than in a URL that ends up in logs.
 */
export class ListSessionsDto {
    @ApiProperty({ required: false, example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    @Length(1, 2048)
    refreshToken?: string;
}
