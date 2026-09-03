import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsPhoneNumber, IsString, Length } from 'class-validator';
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

    /**
     * Whether the family wants to hear from the school about anything beyond their own business —
     * E17/S4. It gates marketing and nothing else: invoices, receipts, a called-off class and the
     * child's own work never rest on it.
     */
    @ApiProperty({ example: true, required: false, description: 'Marketing only. Never gates transactional mail.' })
    @IsOptional()
    @IsBoolean()
    marketingOptIn?: boolean;
}
