import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity';
import { LegalDocument } from '../enum/legal-document.enum';

/**
 * Who accepted which version of which document, and when — E22 S4, first half.
 *
 * A row per acceptance rather than a pair of columns on `User`, for the reason the epic gives: a
 * document that changes without history makes it impossible to say what a family actually agreed
 * to, and that is the only question that matters if anyone ever asks. Registration writes one row
 * per document, in the same transaction as the account; a new version of a document will add a
 * row when the parent accepts it again (S4's second half, not built yet), never overwrite one.
 *
 * The version is the string printed at the top of the document in `docs/legal/`, copied from
 * `LEGAL_DOCUMENT_VERSIONS` at the moment of acceptance — a spec keeps the two equal.
 */
@Entity('document_acceptances')
@Index('IDX_document_acceptances_user_document', ['user', 'document'])
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
