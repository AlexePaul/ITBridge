import { Column, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * One customized email template — E17/S2.
 *
 * A row exists only when the school has edited the wording: the defaults live in code
 * (`apps/api/src/modules/mail/template-defaults.ts`), next to the sample data and the list of
 * variables each template understands. That split is the whole design — "revert to the original"
 * is deleting the row, a fresh deploy ships better defaults without touching anyone's edits, and
 * the acceptance criterion ("un șablon se modifică fără deploy") is the row itself.
 */
@Entity('mail_templates')
export class MailTemplate {
    @PrimaryGeneratedColumn('increment')
    id: number;

    /** The template's name in code — `email-confirmation`, `account-approved`. Never shown to parents. */
    @Column({ type: 'varchar', length: 60, unique: true })
    key: string;

    @Column({ type: 'text' })
    subject: string;

    @Column({ type: 'text' })
    bodyText: string;

    @Column({ type: 'text', nullable: true })
    bodyHtml: string | null;

    /** Bumped on every save. The outbox stores rendered bodies, so this is bookkeeping, not a FK. */
    @Column({ type: 'int', default: 1 })
    version: number;

    @UpdateDateColumn({ type: 'timestamptz' })
    updatedAt: Date;
}
