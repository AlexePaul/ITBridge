import { IsNotEmpty, IsNumber, IsOptional, IsDateString } from 'class-validator';
import { InvoiceStatus } from '../../../entities/invoice.entity';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateInvoiceDto {
    @ApiProperty({ example: 1, description: 'ID of the parent' })
    @IsNumber()
    @IsNotEmpty()
    parentId: number;

    @ApiProperty({ example: '2024-07-01', description: 'Date when the invoice was issued' })
    @IsDateString()
    @IsNotEmpty()
    dateIssued: string;

    @ApiProperty({ example: '2024-07', description: 'Month when the invoice was issued' })
    @IsNotEmpty()
    monthIssued: string;

    @ApiPropertyOptional({ example: 'pending', description: 'Status of the invoice', required: false })
    @IsOptional()
    status?: InvoiceStatus;
}
