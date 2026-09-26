import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsNumber, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

export class FilterPaymentDto {
    @ApiPropertyOptional({ example: 1, description: 'Filter by invoice ID' })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    invoiceId?: number;

    @ApiPropertyOptional({ example: '2024-06-01', description: 'Filter start date' })
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    dateFrom?: string;

    @ApiPropertyOptional({ example: '2024-06-30', description: 'Filter end date' })
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    dateTo?: string;

    /**
     * Only what still waits on somebody, whatever its date: a transfer announced and not yet
     * confirmed or given up on, and a collection SmartBill has to be checked or sent again.
     *
     * The payments screen shows one month at a time — every payment ever recorded was 9.6 MB and
     * 1.9 GB of browser memory at three years (review of 26 September 2026) — and these are the
     * rows a month would hide from the person who has to act on them.
     */
    @ApiPropertyOptional({ description: 'Only announced transfers and collections SmartBill needs a person for, whatever their date' })
    @IsOptional()
    @Transform(({ value }) => value === true || value === 'true')
    @IsBoolean()
    needsAction?: boolean;
}
