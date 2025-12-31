import { IsOptional, IsNumber, IsDateString } from 'class-validator';
import { InvoiceStatus } from '../../../entities/invoice.entity';

export class UpdateInvoiceDto {
    @IsOptional()
    @IsNumber()
    amount?: number;

    @IsOptional()
    @IsDateString()
    dateIssued?: string;

    @IsOptional()
    status?: InvoiceStatus;
}
