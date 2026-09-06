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
    // The three fields step two of registration exists to collect. They were missing from this DTO
    // entirely, which is why `/user/profile-setup` never asked for them: with `forbidNonWhitelisted`
    // on, a form that sent them would have had the whole request rejected. So the two doors into a
    // `Profile` demanded ten fields and five, and a family who arrived through the second one ended
    // up without the emergency contact the first one treats as mandatory.
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    @Length(1, 200)
    emergencyContactName?: string;

    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    @Length(1, 100)
    emergencyContactRelation?: string;

    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    @IsPhoneNumber('RO')
    emergencyContactPhone?: string;

    @IsOptional()
    @IsBoolean()
    marketingOptIn?: boolean;

    /*
     * Who to call when a child is hurt and the parent does not answer — E11/S2.
     *
     * `RegisterDto` demands all three of a parent who signs themselves up, and the columns have
     * existed since. They were missing here, which left the school's own families — the ones an
     * admin types in from a phone call, with nothing but a name — permanently unable to supply
     * them: `whitelist` plus `forbidNonWhitelisted` means a field no DTO declares does not get
     * ignored, it rejects the whole request. So the portal screen that asks for the missing details
     * (E18/S4, screen 6b) had no endpoint to send them to.
     *
     * Optional rather than required, unlike at registration: this DTO is a partial update, and a
     * parent editing their address must not have to retype an emergency contact to do it. The
     * shapes are otherwise the same as `RegisterDto`'s, so the two doors cannot disagree about what
     * a valid contact looks like.
     */
    @ApiProperty({ example: 'Ana Popescu', required: false })
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    @Length(1, 200)
    emergencyContactName?: string;

    @ApiProperty({ example: 'bunica', required: false })
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    @Length(1, 100)
    emergencyContactRelation?: string;

    @ApiProperty({ example: '0723456789', required: false })
    @EmptyToUndefined()
    @IsOptional()
    @IsString()
    @IsPhoneNumber('RO')
    emergencyContactPhone?: string;
}
