import { IsOptional, IsNumber, IsDateString, IsEnum, Min } from 'class-validator';
import { InvoiceStatus } from '../../../entities/invoice.entity';
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

    @ApiPropertyOptional({ example: InvoiceStatus.PAID, description: 'Updated status', enum: InvoiceStatus })
    @EmptyToUndefined()
    @IsOptional()
    // Had no type decorator at all, so `status: "definitely-paid"` was written straight to an enum
    // column and surfaced as a database error rather than a 400 naming the field.
    @IsEnum(InvoiceStatus)
    status?: InvoiceStatus;
}
