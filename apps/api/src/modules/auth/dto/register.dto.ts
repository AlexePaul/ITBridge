import { Equals, IsBoolean, IsEmail, IsNotEmpty, IsString, Length, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * What an account needs to exist — and only that.
 *
 * This is the first of two required steps, not a lighter version of one. E11/S2 moved the whole of
 * D8 in here for a good reason: before it the DTO held `username` and `password` and nothing else,
 * the contact details were asked afterwards on a screen where they were **optional**, and a family
 * could exist for months with no address to send an invoice to and no number to call. The invoice
 * still went out; it went nowhere, silently.
 *
 * What that fix produced was a first screen with ten mandatory fields, at exactly the point
 * E20 spends an epic lowering barriers — and a parent who abandons at field eight is not a family
 * with incomplete data, it is a family the school never saw. So the fields moved back out, and the
 * thing that makes this different from the state E11/S2 repaired is that **step two cannot be
 * skipped**: the fields there are required, `isProfileComplete` derives the answer, and a child
 * cannot be placed in a group until it comes back true (`PARENT_PROFILE_INCOMPLETE`).
 *
 * What stays here is what an account is: who you are, where the confirmation link goes, and how you
 * sign in. Phone, address and the emergency contact live in `UpdateProfileDto`.
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

    /**
     * The checkbox on the form — E22 S2/S4. `true` or the request is refused: the account is the
     * contract the terms describe, so there is no account without them. What was accepted — which
     * version of which document, when — is written by `AuthService.register` in the same
     * transaction as the account, not read back from this flag.
     */
    @ApiProperty({ example: true, description: 'Must be true: the parent has read and accepts the terms and the privacy notice' })
    @IsBoolean()
    @Equals(true, { message: 'Termenii și politica de confidențialitate trebuie acceptate' })
    acceptedTerms: boolean;

    /**
     * The second checkbox — E22 S4, second half, and the whole of Cod civil art. 1203.
     *
     * Terms §14 (suspension), §15 (limited liability) and §18 (unilateral amendment) are what the
     * article calls unusual clauses in a standard contract, and they *produce no effect* unless
     * they are accepted expressly and separately. A single tick covering the whole document is
     * exactly the acceptance the article does not count, so the form asks twice and the ledger
     * records two things: that the terms were accepted, and that these clauses were.
     *
     * Separate, not optional. An account is the contract these clauses are part of, so there is no
     * account without them either — the way out of disagreeing with them is not to have an account,
     * which §18 names and which the portal offers as erasure on request (E07 S4).
     */
    @ApiProperty({ example: true, description: 'Must be true: the parent expressly accepts the unusual clauses of the terms (§14, §15, §18)' })
    @IsBoolean()
    @Equals(true, { message: 'Clauzele din §14, §15 și §18 trebuie acceptate separat' })
    acceptedUnusualClauses: boolean;

    /**
     * One free-text line, as `Profile.address` already is. Whether the invoice needs street, city
     * and county as separate columns is E16's question — it is a change of shape to this same
     * field, not another field.
     */
}
