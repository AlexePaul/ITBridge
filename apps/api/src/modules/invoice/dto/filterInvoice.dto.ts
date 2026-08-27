import { Type } from 'class-transformer';
import { IsOptional, IsNumber, IsString, IsEnum } from 'class-validator';
import { InvoiceStatus } from '../../../entities/invoice.entity';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class FilterInvoiceDto {
    @ApiPropertyOptional({ example: 1, description: 'Filter by parent ID' })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    parentId?: number;

    @ApiPropertyOptional({ example: InvoiceStatus.PAID, description: 'Filter by invoice status', enum: InvoiceStatus })
    @IsOptional()
    // `@IsEnum`, not nothing at all: an unknown status used to reach Postgres and come back as a
    // database error rather than a 400 naming the field.
    @IsEnum(InvoiceStatus)
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
