import { IsOptional, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserDto {
    @ApiProperty({ example: 'username123', required: false })
    @IsOptional()
    @IsString()
    @Length(1, 30)
    username?: string;

    @ApiProperty({ example: 'PARENT', required: false })
    @IsOptional()
    @IsString()
    role?: 'ADMIN' | 'PARENT';
}
