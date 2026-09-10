import { IsNotEmpty, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * What the „nu mai vreau" page posts — E17 S4.
 *
 * The token is the whole credential, which is why it is 32 random bytes rather than an id: the
 * route is public by necessity (a parent reading a newsletter is not signed in) and anything
 * guessable would let a stranger unsubscribe families one number at a time.
 */
export class UnsubscribeDto {
    @ApiProperty({ example: 'Zm9vYmFyYmF6cXV4...' })
    @IsString()
    @IsNotEmpty()
    @Length(1, 64)
    token: string;
}
