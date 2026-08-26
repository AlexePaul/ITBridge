import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class CreateChildDto {
    @ApiProperty({ example: 'John' })
    @IsString()
    @IsNotEmpty()
    firstName: string;

    @ApiProperty({ example: 'Doe' })
    @IsString()
    @IsNotEmpty()
    lastName: string;

    @ApiProperty({ example: '2015-06-15' })
    @IsDateString()
    birthDate: string;

    @ApiProperty({ example: 1 })
    @IsNumber()
    @IsNotEmpty()
    parentId: number;
}
