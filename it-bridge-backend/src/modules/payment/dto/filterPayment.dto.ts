import { IsOptional, IsNumber, IsString } from 'class-validator';

export class FilterPaymentDto {
    @IsOptional()
    @IsNumber()
    invoiceId?: number;

    @IsOptional()
    @IsString()
    dateFrom?: string;

    @IsOptional()
    @IsString()
    dateTo?: string;
}
