import { IsNotEmpty, IsNumber, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateInvoiceDto {
    @ApiProperty({ example: [1, 2, 3], description: 'IDs of the parents' })
    @IsNumber({}, { each: true })
    @IsNotEmpty()
    parentIds: number[];

    @ApiProperty({ example: '2024-07-01', description: 'Date when the invoice was issued' })
    @IsDateString()
    @IsNotEmpty()
    dateIssued: string;

    @ApiProperty({ example: '2024-07', description: 'Month when the invoice was issued' })
    @IsNotEmpty()
    monthIssued: string;
}
