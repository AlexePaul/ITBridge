import { IsEmail, IsNotEmpty, IsPhoneNumber, IsString, Length, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Everything the school needs before a family can exist — E11/S2, and the list is closed by D8.
 *
 * Until this epic the DTO held `username` and `password` and nothing else, so a parent account
 * could exist with no address to send an invoice to and no number to call. The invoice still went
 * out; it simply went nowhere, **silently**, which nobody found out about until somebody asked why
 * a family had not paid.
 *
 * There is no `@EmptyToUndefined()` anywhere in this file, unlike its counterparts in
 * `CreateProfileDto`. That decorator exists because an untyped HTML input posts `''` and an
 * optional field should treat that as "not given". Here the fields are *required*, so `''` has to
 * fail — turning it into `undefined` first would make it fail with "should not be empty" instead of
 * a message about the field, and on a field the parent can see they left blank that is the same
 * outcome by a worse route. `@IsNotEmpty()` rejects it directly.
 *
 * **No CNP**, deliberately (D8). SmartBill needs a name and an address to invoice a private
 * individual; a national ID number would bring its own lawful-basis, minimisation and retention
 * obligations into E07 in exchange for nothing.
 */
export class RegisterDto {
    @ApiProperty({ example: 'username123' })
    @IsString()
    @Length(1, 30)
    username: string;

    @ApiProperty({ example: 'password123', minLength: 6 })
    @IsString()
    @MinLength(6)
    password: string;

    @ApiProperty({ example: 'Ioana' })
    @IsString()
    @IsNotEmpty()
    @Length(1, 100)
    firstName: string;

    @ApiProperty({ example: 'Popescu' })
    @IsString()
    @IsNotEmpty()
    @Length(1, 100)
    lastName: string;

    /** Confirmed by link before the account can be used, so a typo here stops the registration, not the first invoice. */
    @ApiProperty({ example: 'ioana.popescu@example.com' })
    @IsString()
    @IsNotEmpty()
    @IsEmail()
    @Length(1, 255)
    email: string;

    @ApiProperty({ example: '0712345678', description: 'Acceptă 07xxxxxxxx sau +407xxxxxxxx' })
    @IsString()
    @IsNotEmpty()
    @IsPhoneNumber('RO')
    phone: string;

    /**
     * One free-text line, as `Profile.address` already is. Whether the invoice needs street, city
     * and county as separate columns is E16's question — it is a change of shape to this same
     * field, not another field.
     */
    @ApiProperty({ example: 'Str. Exemplu 12, București' })
    @IsString()
    @IsNotEmpty()
    @Length(1, 255)
    address: string;

    @ApiProperty({ example: 'Maria Popescu', description: 'Persoana de contact în caz de urgență' })
    @IsString()
    @IsNotEmpty()
    @Length(1, 200)
    emergencyContactName: string;

    @ApiProperty({ example: 'bunica' })
    @IsString()
    @IsNotEmpty()
    @Length(1, 100)
    emergencyContactRelation: string;

    @ApiProperty({ example: '0723456789' })
    @IsString()
    @IsNotEmpty()
    @IsPhoneNumber('RO')
    emergencyContactPhone: string;
}
