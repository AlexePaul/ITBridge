import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsEmail, Length, IsPhoneNumber } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

export class UpdateProfileDto {
    @ApiProperty({ example: 'user@example.com', required: false })
    @EmptyToUndefined()
    @IsOptional()
    @IsEmail()
    email?: string;

    /** `'RO'`, so the local `07xxxxxxxx` form is accepted alongside `+407xxxxxxxx`. */
    @ApiProperty({ example: '0712345678', required: false })
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    @IsPhoneNumber('RO')
    phone?: string;

    @ApiProperty({ example: 'John' })
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    @Length(1, 100)
    firstName?: string;

    @ApiProperty({ example: 'Doe' })
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    @Length(1, 100)
    lastName?: string;

    @ApiProperty({ example: '123 Main St', required: false })
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    @Length(1, 255)
    address?: string;
}
