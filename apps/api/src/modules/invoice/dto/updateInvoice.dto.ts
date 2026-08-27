import { IsOptional, IsNumber, IsDateString, IsEnum } from 'class-validator';
import { InvoiceStatus } from '../../../entities/invoice.entity';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateInvoiceDto {
    @ApiPropertyOptional({ example: 350, description: 'Updated amount' })
    @IsOptional()
    @IsNumber()
    amount?: number;

    @ApiPropertyOptional({ example: '2024-07-01', description: 'Updated issue date' })
    @IsOptional()
    @IsDateString()
    dateIssued?: string;

    @ApiPropertyOptional({ example: InvoiceStatus.PAID, description: 'Updated status', enum: InvoiceStatus })
    @IsOptional()
    // Had no type decorator at all, so `status: "definitely-paid"` was written straight to an enum
    // column and surfaced as a database error rather than a 400 naming the field.
    @IsEnum(InvoiceStatus)
    status?: InvoiceStatus;
}
