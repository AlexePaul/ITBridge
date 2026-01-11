import { IsOptional, IsNumber, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class FilterPaymentDto {
    @ApiPropertyOptional({ example: 1, description: 'Filter by invoice ID' })
    @IsOptional()
    @IsNumber()
    invoiceId?: number;

    @ApiPropertyOptional({ example: '2024-06-01', description: 'Filter start date' })
    @IsOptional()
    @IsString()
    dateFrom?: string;

    @ApiPropertyOptional({ example: '2024-06-30', description: 'Filter end date' })
    @IsOptional()
    @IsString()
    dateTo?: string;
}
