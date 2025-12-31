import { IsOptional, IsString, IsDateString } from 'class-validator';

export class UpdatePaymentDto {
    @IsOptional()
    @IsString()
    method?: string;

    @IsOptional()
    @IsDateString()
    date?: string;
}
