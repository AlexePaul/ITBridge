import { Type } from 'class-transformer';
import { IsOptional, IsNumber, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

export class FilterPaymentDto {
    @ApiPropertyOptional({ example: 1, description: 'Filter by invoice ID' })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    invoiceId?: number;

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
}
