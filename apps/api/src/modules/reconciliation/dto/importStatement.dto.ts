import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * A bank statement, as the text of the CSV the bank exported — E16/S8. Read in the browser and sent
 * as JSON rather than uploaded as a file: a month of a school's statement is a few dozen kilobytes,
 * and this keeps it inside the body limit every other request lives under. A longer one is exported
 * a month at a time.
 */
export class ImportStatementDto {
    @ApiProperty({ description: "The statement file's text, CSV as the bank exports it" })
    @IsString()
    @IsNotEmpty()
    @MaxLength(90_000, { message: 'The statement is too long for one import; export it a month at a time' })
    content: string;
}
