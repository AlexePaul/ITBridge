import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { User } from './user.entity';
import { LegalDocument } from '../enum/legal-document.enum';

/**
 * Who accepted which version of which document, and when — E22 S4.
 *
 * A row per acceptance rather than a pair of columns on `User`, for the reason the epic gives: a
 * document that changes without history makes it impossible to say what a family actually agreed
 * to, and that is the only question that matters if anyone ever asks. Registration writes one row
 * per document, in the same transaction as the account; a new version adds a row when the parent
 * accepts it again, through `POST /auth/accept-documents`, and never overwrites one.
 *
 * The version is the string printed at the top of the document in `docs/legal/`, copied from
 * `LEGAL_DOCUMENT_VERSIONS` at the moment of acceptance — a spec keeps the two equal.
 *
 * One row per version, enforced by `UQ_document_acceptance_user_document_version`: accepting the
 * same version twice is the same fact twice, and two rows would make "when did this family agree
 * to 0.2" a question with two answers. The service checks what is outstanding before writing, so
 * the index is there for the second click of a double-click — the write goes through
 * `ON CONFLICT DO NOTHING`, because that second click is not an error to report, it is a request
 * whose effect already happened.
 */
@Entity('document_acceptances')
@Index('IDX_document_acceptances_user_document', ['user', 'document'])
@Unique('UQ_document_acceptance_user_document_version', ['user', 'document', 'version'])
export class DocumentAcceptance {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
    @JoinColumn({ name: 'user_id' })
    user: User;

    @Column({ type: 'enum', enum: LegalDocument })
    document: LegalDocument;

    /** As printed on the document: `0.1`, `1.0`. Text, because a version is a label, not a number. */
    @Column({ type: 'varchar', length: 20 })
    version: string;

    @CreateDateColumn({ type: 'timestamptz' })
    acceptedAt: Date;
}
