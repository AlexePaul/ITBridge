import { IsOptional, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

/**
 * "It is there" for a payment under review — E16/S5. A cash payment brings the receipt's number as
 * the person read it in SmartBill; a transfer has no document, so nothing.
 */
export class ConfirmPaymentRecordDto {
    @ApiPropertyOptional({ example: '0007', description: "The receipt's number in SmartBill; required for cash" })
    @EmptyToUndefined()
    @IsOptional()
    @Matches(/^\d{1,20}$/, { message: 'number must be the receipt number, digits only' })
    number?: string;
}
