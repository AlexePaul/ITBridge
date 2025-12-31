import { IsOptional, IsNumber, IsString } from 'class-validator';
import { InvoiceStatus } from '../../../entities/invoice.entity';

export class FilterInvoiceDto {
    @IsOptional()
    @IsNumber()
    parentId?: number;

    @IsOptional()
    status?: InvoiceStatus;

    @IsOptional()
    @IsString()
    dateFrom?: string;

    @IsOptional()
    @IsString()
    dateTo?: string;
}
