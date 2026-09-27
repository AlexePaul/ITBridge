import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

/** How the browser caught it: Vue's error handler, a promise nobody awaited, or the window itself. */
export const CLIENT_ERROR_KINDS = ['vue', 'unhandledrejection', 'window'] as const;
export type ClientErrorKind = (typeof CLIENT_ERROR_KINDS)[number];

/**
 * A screen that broke in someone's browser — E06 S1.
 *
 * Every field is capped: the route is open to any signed-in account, so its body is somebody's
 * choice, and the row it writes has columns of fixed size.
 */
export class ClientErrorDto {
    @ApiProperty({ example: 'TypeError' })
    @IsString()
    @Length(1, 100)
    name: string;

    @ApiProperty({ example: "Cannot read properties of undefined (reading 'id')" })
    @IsString()
    @Length(1, 1000)
    message: string;

    @ApiPropertyOptional()
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    @MaxLength(8000)
    stack?: string;

    /** The page's route pattern — `/admin/profiles/:id` — so thirty families are one fault. */
    @ApiProperty({ example: '/admin/profiles/:id' })
    @IsString()
    @Length(1, 200)
    route: string;

    /** The address itself, redacted on arrival like a log line. */
    @ApiPropertyOptional({ example: '/admin/profiles/12' })
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    @MaxLength(500)
    path?: string;

    /** The component chain Vue reported, innermost first — `InvoiceTable < AdminPage`. */
    @ApiPropertyOptional({ example: 'InvoiceTable < AdminPage' })
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    @MaxLength(200)
    component?: string;

    @ApiProperty({ enum: CLIENT_ERROR_KINDS })
    @IsIn(CLIENT_ERROR_KINDS)
    kind: ClientErrorKind;

    /** The reference the error page showed, made up in the browser, so a read-out code finds the row. */
    @ApiPropertyOptional({ example: 'b7e1c04a' })
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    @Matches(/^[a-f0-9]{8,32}$/)
    reference?: string;
}
