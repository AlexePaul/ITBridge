import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, Length } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';
import { PaymentMethod } from 'src/enum/payment-method.enum';
import { PaymentStatus } from 'src/enum/payment-status.enum';

export class UpdatePaymentDto {
    @ApiPropertyOptional({ example: 350, description: 'Corrected sum, in lei' })
    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @IsPositive()
    amount?: number;

    @ApiPropertyOptional({ enum: PaymentMethod })
    @IsOptional()
    @IsEnum(PaymentMethod)
    method?: PaymentMethod;

    /** The way a transfer that bounced, or a sum that went back, is recorded after the fact. */
    @ApiPropertyOptional({ enum: PaymentStatus })
    @IsOptional()
    @IsEnum(PaymentStatus)
    status?: PaymentStatus;

    @ApiPropertyOptional({ example: '2026-03-01' })
    @IsOptional()
    @IsDateString()
    date?: string;

    @ApiPropertyOptional({ example: 'OP 1234' })
    @EmptyToUndefined()
    @IsOptional()
    @Length(1, 100)
    externalReference?: string;

    @ApiPropertyOptional()
    @EmptyToUndefined()
    @IsOptional()
    @Length(1, 500)
    notes?: string;
}
