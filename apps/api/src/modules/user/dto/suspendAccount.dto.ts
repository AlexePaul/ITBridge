import { IsString, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Trim } from 'src/common/trim';

export class SuspendAccountDto {
    /**
     * Why — required, because terms §14 promise the family an email that says so, and this is the
     * sentence it reads. Unlike a refusal's note it is not shorthand between admins.
     */
    @ApiProperty({ example: 'Contul a fost folosit de persoane din afara familiei.', description: 'Motivul suspendării; pleacă în emailul către familie' })
    @Trim()
    @IsString({ message: 'Scrie motivul suspendării' })
    @Length(1, 500, { message: 'Motivul suspendării trebuie să aibă între 1 și 500 de caractere' })
    reason: string;
}
