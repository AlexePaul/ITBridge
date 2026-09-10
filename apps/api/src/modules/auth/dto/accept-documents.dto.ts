import { ArrayNotEmpty, IsArray, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { LegalDocument } from 'src/enum/legal-document.enum';

/**
 * Which documents the parent is accepting right now — E22 S4, second half.
 *
 * The documents are named rather than implied by a bare "accept everything outstanding", because
 * the tick is the acceptance and the request has to say what was ticked. It matters for the unusual
 * clauses in particular: Cod civil art. 1203 asks for an express, separate acceptance, and a call
 * carrying no list would record one the reader never gave.
 *
 * The service refuses a list that leaves something outstanding, so the screen cannot half-satisfy
 * the gate and leave the parent bouncing off it with no explanation. Extra names are harmless — a
 * document already accepted in the version in force writes no second row.
 */
export class AcceptDocumentsDto {
    @ApiProperty({ enum: LegalDocument, isArray: true, example: [LegalDocument.TERMS, LegalDocument.PRIVACY, LegalDocument.UNUSUAL_CLAUSES] })
    @IsArray()
    @ArrayNotEmpty()
    @IsEnum(LegalDocument, { each: true })
    documents: LegalDocument[];
}
