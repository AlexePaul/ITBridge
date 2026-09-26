import { IsBoolean, IsInt, IsOptional, IsPositive } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** The invoice a statement line pays, as a person decided it — proposed or picked by hand. */
export class MatchStatementLineDto {
    @ApiProperty({ example: 412 })
    @IsInt()
    @IsPositive()
    invoiceId: number;

    /**
     * The office has seen that the line pays more than the invoice still owes, and records it on the
     * invoice anyway — two real payments of the same month, say, one to be given back.
     */
    @ApiPropertyOptional({ example: false })
    @IsOptional()
    @IsBoolean()
    acceptOverpayment?: boolean;
}
