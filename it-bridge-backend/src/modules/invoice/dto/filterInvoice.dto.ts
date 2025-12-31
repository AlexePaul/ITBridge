import { IsOptional, IsNumber, IsString } from 'class-validator';
import { InvoiceStatus } from '../../../entities/invoice.entity';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class FilterInvoiceDto {
    @ApiPropertyOptional({ example: 1, description: 'Filter by parent ID' })
    @IsOptional()
    @IsNumber()
    parentId?: number;

    @ApiPropertyOptional({ example: InvoiceStatus.PAID, description: 'Filter by invoice status', enum: InvoiceStatus })
    @IsOptional()
    status?: InvoiceStatus;

    @ApiPropertyOptional({ example: '2024-06-01', description: 'Filter start date' })
    @IsOptional()
    @IsString()
    dateFrom?: string;

    @ApiPropertyOptional({ example: '2024-06-30', description: 'Filter end date' })
    @IsOptional()
    @IsString()
    dateTo?: string;
}
