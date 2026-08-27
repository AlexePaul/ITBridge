import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsPhoneNumber, IsString, Length } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

export class CreateProfileDto {
    @ApiProperty({ example: 'user@example.com', required: false })
    @EmptyToUndefined()
    @IsOptional()
    @IsEmail()
    email?: string;

    // `'RO'` rather than no region. Without it `@IsPhoneNumber()` demands E.164, so `0712345678` —
    // the way every parent in the country writes their own number, and the exact shape the setup
    // form enforces — was a 400. With the region, both that and `+40712345678` are accepted.
    @ApiProperty({ example: '0712345678', required: false, description: 'Accepts 07xxxxxxxx or +407xxxxxxxx' })
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    @IsPhoneNumber('RO')
    phone?: string;

    @ApiProperty({ example: 'John' })
    @IsString()
    @IsNotEmpty()
    @Length(1, 100)
    firstName: string;

    @ApiProperty({ example: 'Doe' })
    @IsString()
    @IsNotEmpty()
    @Length(1, 100)
    lastName: string;

    @ApiProperty({ example: '123 Main St', required: false })
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    @Length(1, 255)
    address?: string;

    // `@IsInt` was missing entirely: the only field in any DTO with no type decorator at all, so
    // `userId: "abc"` sailed past the pipe and failed in Postgres as a 22P02 instead.
    @ApiProperty({ example: 1, required: false, description: 'User ID' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    userId?: number;
}
