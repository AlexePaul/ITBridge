import { IsOptional, IsString, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdatePaymentDto {
    @ApiPropertyOptional({ example: 'credit_card', description: 'Updated payment method' })
    @IsOptional()
    @IsString()
    method?: string;

    @ApiPropertyOptional({ example: '2024-07-01', description: 'Updated payment date' })
    @IsOptional()
    @IsDateString()
    date?: string;
}
