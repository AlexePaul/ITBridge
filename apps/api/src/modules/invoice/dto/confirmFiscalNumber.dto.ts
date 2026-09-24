import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

/**
 * "SmartBill did issue it, and this is the number" — the way out of `review` — E16/S2.
 *
 * Digits only, as SmartBill prints them, zero-padding included: the number is looked up by exactly
 * this string when the PDF is fetched, so `42` and `0042` are not the same answer. The series is
 * not sent — it is the platform's own, from the configuration, and a field for it would be a way to
 * attach an invoice to a series the platform never issues on.
 */
export class ConfirmFiscalNumberDto {
    @ApiProperty({ example: '0042', description: 'The number SmartBill shows for the invoice, as it shows it' })
    @Matches(/^\d{1,20}$/, { message: 'number must be the invoice number as SmartBill prints it, digits only' })
    number: string;
}
