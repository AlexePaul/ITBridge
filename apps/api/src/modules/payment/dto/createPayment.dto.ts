import { IsNotEmpty, IsNumber, IsOptional, IsString, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreatePaymentDto {
    @ApiProperty({ example: 1, description: 'ID of the invoice being paid' })
    @IsNumber()
    @IsNotEmpty()
    invoiceId: number;

    @ApiPropertyOptional({ example: 'credit_card', description: 'Payment method' })
    @IsString()
    @IsOptional()
    method?: string;

    @ApiProperty({ example: '2024-07-01', description: 'Payment date' })
    @IsDateString()
    @IsNotEmpty()
    date: string;
}
