import { IsNotEmpty, IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ConfirmEmailDto {
    /**
     * The token from the link, not its hash — the hash is what the server keeps. 43 characters is
     * what 32 random bytes come to in base64url; the bound is generous on both sides so a token
     * mangled by a mail client fails validation rather than reaching the lookup.
     */
    @ApiProperty({ example: 'k3Xq...', description: 'Tokenul din linkul de confirmare' })
    @IsString()
    @IsNotEmpty()
    @Length(20, 200)
    token: string;
}
