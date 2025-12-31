import { IsNotEmpty, IsNumber, IsOptional, IsDateString } from 'class-validator';
import { InvoiceStatus } from '../../../entities/invoice.entity';

export class CreateInvoiceDto {
    @IsNumber()
    @IsNotEmpty()
    parentId: number;

    @IsNumber()
    @IsNotEmpty()
    amount: number;

    @IsDateString()
    @IsNotEmpty()
    dateIssued: string;

    @IsOptional()
    status?: InvoiceStatus;
}
