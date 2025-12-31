import { IsNotEmpty, IsNumber, IsOptional, IsString, IsDateString } from 'class-validator';

export class CreatePaymentDto {
    @IsNumber()
    @IsNotEmpty()
    invoiceId: number;

    @IsString()
    @IsOptional()
    method?: string;

    @IsDateString()
    @IsNotEmpty()
    date: string;
}
