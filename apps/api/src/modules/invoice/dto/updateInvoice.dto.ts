import { IsOptional, IsNumber, IsDateString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

export class UpdateInvoiceDto {
    @ApiPropertyOptional({ example: 350, description: 'Updated amount' })
    @IsOptional()
    @IsNumber()
    // Zero is a month without charge (`waived`); below it is a credit note, which a correction here
    // is not — and on an invoice still queued for SmartBill it went out as a negative price.
    @Min(0)
    amount?: number;

    @ApiPropertyOptional({ example: '2024-07-01', description: 'Updated issue date' })
    @EmptyToUndefined()
    @IsOptional()
    @IsDateString()
    dateIssued?: string;

    // No `status`, on purpose — the review of 25 September 2026. It is derived: `paid` from the
    // succeeded payments, `waived` from a zero amount, `overdue` from the calendar. Typed by hand it
    // said `paid` on the portal beside a debt on the arrears screen, which counts the payments; a
    // request that still sends it gets a 400 from `forbidNonWhitelisted`, not a silent success.
}
