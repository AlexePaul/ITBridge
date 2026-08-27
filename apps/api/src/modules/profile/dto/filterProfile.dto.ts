import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsEmail, Length, IsString, IsPhoneNumber, IsNumber } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';

/**
 * `EmptyToUndefined` on every text filter: a search form that submits with a field left blank sends
 * `?email=`, and an empty string is not a valid email — so the filter used to reject the request
 * rather than simply not filtering on it.
 */
export class FilterProfileDto {
    @ApiPropertyOptional({ example: 'user@example.com', required: false })
    @EmptyToUndefined()
    @IsOptional()
    @IsEmail()
    email?: string;

    @ApiPropertyOptional({ example: '0712345678', required: false })
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    @IsPhoneNumber('RO')
    phone?: string;

    @ApiPropertyOptional({ example: 'John', required: false })
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    @Length(1, 100)
    firstName?: string;

    @ApiPropertyOptional({ example: 'Doe', required: false })
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    @Length(1, 100)
    lastName?: string;

    @ApiPropertyOptional({ example: 1, required: false })
    @EmptyToUndefined()
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    profileId?: number;

    @ApiPropertyOptional({ example: 1, required: false, description: 'User ID' })
    @EmptyToUndefined()
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    userId?: number;
}
