import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, Length } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';
import { PaymentMethod } from 'src/enum/payment-method.enum';
import { PaymentStatus } from 'src/enum/payment-status.enum';

export class UpdatePaymentDto {
    @ApiPropertyOptional({ example: 350, description: 'Corrected sum, in lei' })
    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Suma se scrie în lei, cu cel mult două zecimale' })
    @IsPositive({ message: 'Suma trebuie să fie mai mare decât zero' })
    amount?: number;

    @ApiPropertyOptional({ enum: PaymentMethod })
    @EmptyToUndefined()
    @IsOptional()
    @IsEnum(PaymentMethod)
    method?: PaymentMethod;

    /** The way a transfer that bounced, or a sum that went back, is recorded after the fact. */
    @ApiPropertyOptional({ enum: PaymentStatus })
    @EmptyToUndefined()
    @IsOptional()
    @IsEnum(PaymentStatus)
    status?: PaymentStatus;

    @ApiPropertyOptional({ example: '2026-03-01' })
    @EmptyToUndefined()
    @IsOptional()
    @IsDateString({}, { message: 'Data plății nu e o dată validă' })
    date?: string;

    @ApiPropertyOptional({ example: 'OP 1234' })
    @EmptyToUndefined()
    @IsOptional()
    @Length(1, 100, { message: 'Referința poate avea cel mult 100 de caractere' })
    externalReference?: string;

    @ApiPropertyOptional()
    @EmptyToUndefined()
    @IsOptional()
    @Length(1, 500, { message: 'Nota poate avea cel mult 500 de caractere' })
    notes?: string;
}
