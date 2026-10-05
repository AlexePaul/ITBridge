import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsEmail, Length, IsString, IsPhoneNumber, IsNumber } from 'class-validator';
import { EmptyToUndefined } from 'src/common/empty-to-undefined';
import { NormalizePhone } from 'src/common/romanian-phone';

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
    @NormalizePhone()
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
    // In Romanian: `/admin/profiles/abc` asks for `?profileId=abc`, and the screen shows this sentence
    // (QA of 27 September 2026 read "profileId must be a number conforming to the specified constraints").
    @IsNumber({}, { message: 'Numărul familiei din adresă nu e valid' })
    profileId?: number;

    @ApiPropertyOptional({ example: 1, required: false, description: 'User ID' })
    @EmptyToUndefined()
    @IsOptional()
    @Type(() => Number)
    @IsNumber({}, { message: 'Numărul contului din adresă nu e valid' })
    userId?: number;
}
