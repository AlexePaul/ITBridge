import { Type } from 'class-transformer';
import { IsOptional, IsNumber, IsString, IsEnum, Matches } from 'class-validator';
import { InvoiceStatus } from '../../../entities/invoice.entity';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

export class FilterInvoiceDto {
    @ApiPropertyOptional({ example: 1, description: 'Filter by parent ID' })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    parentId?: number;

    @ApiPropertyOptional({ example: InvoiceStatus.PAID, description: 'Filter by invoice status', enum: InvoiceStatus })
    @EmptyToUndefined()
    @IsOptional()
    // `@IsEnum`, not nothing at all: an unknown status used to reach Postgres and come back as a
    // database error rather than a 400 naming the field.
    @IsEnum(InvoiceStatus)
    status?: InvoiceStatus;

    @ApiPropertyOptional({ example: '2024-06-01', description: 'Filter start date' })
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    dateFrom?: string;

    @ApiPropertyOptional({ example: '2024-06-30', description: 'Filter end date' })
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    dateTo?: string;

    /**
     * One billing month. The month's page asked for every invoice ever issued and kept one month of
     * them — 6.9 MB at three years, for a page about thirty rows (review of 26 September 2026).
     */
    @ApiPropertyOptional({ example: '2026-09', description: 'Only the invoices of one billing month' })
    @EmptyToUndefined()
    @IsOptional()
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'monthIssued must be YYYY-MM' })
    monthIssued?: string;
}
