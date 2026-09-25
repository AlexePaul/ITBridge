import { IsInt, IsPositive } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** The invoice a statement line pays, as a person decided it — proposed or picked by hand. */
export class MatchStatementLineDto {
    @ApiProperty({ example: 412 })
    @IsInt()
    @IsPositive()
    invoiceId: number;
}
