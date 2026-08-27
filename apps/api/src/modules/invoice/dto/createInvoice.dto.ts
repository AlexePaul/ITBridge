import { ArrayNotEmpty, ArrayUnique, IsArray, IsNotEmpty, IsNumber, IsDateString, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateInvoiceDto {
    @ApiProperty({ example: [1, 2, 3], description: 'IDs of the parents' })
    // `@IsNotEmpty` on an array only rejects null and ''. `@ArrayNotEmpty` is the one that rejects
    // `[]`, which would otherwise issue nothing and report success.
    // `@ArrayUnique` because the same parent twice produces two rows for one (parent, monthIssued)
    // and trips the unique constraint — reported as ALREADY_EXISTS, which reads as "this month is
    // already invoiced" rather than "you sent a duplicate". With the batch in one transaction it
    // would also roll back every other invoice in the call.
    @IsArray()
    @ArrayNotEmpty()
    @ArrayUnique()
    @IsNumber({}, { each: true })
    parentIds: number[];

    @ApiProperty({ example: '2024-07-01', description: 'Date when the invoice was issued' })
    @IsDateString()
    @IsNotEmpty()
    dateIssued: string;

    // `@Unique(['parent', 'monthIssued'])` on the entity keys off this exact string, and the column
    // is varchar(7). Anything but YYYY-MM either collides wrongly or gets truncated.
    @ApiProperty({ example: '2024-07', description: 'Month when the invoice was issued' })
    @IsNotEmpty()
    @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'monthIssued must be in YYYY-MM format' })
    monthIssued: string;
}
