import { ApiProperty } from '@nestjs/swagger';
import { IsInt } from 'class-validator';

/** Which class to spend the make-up credit on — E12/S4. The credit is the path parameter. */
export class BookMakeUpDto {
    @ApiProperty({ example: 12 })
    @IsInt()
    classSessionId: number;
}
