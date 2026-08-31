import { IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsPositive, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';
import { PaymentMethod } from 'src/enum/payment-method.enum';
import { PaymentStatus } from 'src/enum/payment-status.enum';

export class CreatePaymentDto {
    @ApiProperty({ example: 1, description: 'ID of the invoice being paid' })
    @IsNumber()
    @IsNotEmpty()
    invoiceId: number;

    /**
     * Required and positive — the whole point of E16/S1 is that a payment is a figure, not a flag.
     * Deliberately NOT capped at the invoice total: a family paying the next month in advance is
     * normal life, and the derivation treats covered-or-more as paid.
     */
    @ApiProperty({ example: 350, description: 'Sum received, in lei' })
    @IsNumber({ maxDecimalPlaces: 2 })
    @IsPositive()
    amount: number;

    @ApiPropertyOptional({ enum: PaymentMethod, description: 'How the money arrived; defaults to cash' })
    @IsOptional()
    @IsEnum(PaymentMethod)
    method?: PaymentMethod;

    @ApiPropertyOptional({ enum: PaymentStatus, description: 'Defaults to succeeded — an admin records money that arrived' })
    @IsOptional()
    @IsEnum(PaymentStatus)
    status?: PaymentStatus;

    @ApiProperty({ example: '2026-03-01', description: 'The day the money moved' })
    @IsDateString()
    @IsNotEmpty()
    date: string;

    @ApiPropertyOptional({ example: 'OP 1234', description: 'Payment-order or cash-receipt number' })
    @EmptyToUndefined()
    @IsOptional()
    @Length(1, 100)
    externalReference?: string;

    @ApiPropertyOptional({ description: 'Free-text note' })
    @EmptyToUndefined()
    @IsOptional()
    @Length(1, 500)
    notes?: string;
}
