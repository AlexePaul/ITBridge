import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Child } from './child.entity';
import { PublicationPurpose } from '../enum/publication-purpose.enum';
import { ConsentChannel } from '../enum/consent-channel.enum';

/**
 * A family's consent to use one child's work for one purpose — E07 S2.
 *
 * **Keyed on the child, not on the family.** The case the epic starts from is the ordinary one: a
 * parent agrees for the elder, who is proud of what they built, and refuses for the younger. With a
 * row per family the only answers are "all of them" and "none of them". The consenting parent is
 * `child.parent`, not a column of its own: a child has one family, and a second column naming it
 * would be free to disagree with the first.
 *
 * **A row is one consent, from its grant to its withdrawal.** Granting inserts a row. Withdrawing
 * stamps `revokedAt` on the row in force and never deletes it, and granting again inserts a new
 * row. So "was this allowed on the day it was used" is answered by the rows themselves, read in
 * order, and nothing is ever overwritten but the one empty column. `UQ_publication_consents_one_in_force`
 * makes a second consent in force for the same child and purpose impossible. It is the same partial
 * index as `UQ_enrollments_one_in_force`: what is unique is what is in force, not what ever was. The
 * service inserts through `ON CONFLICT DO NOTHING`, so a double click is the same fact once.
 *
 * **The version is the text the family read.** It is copied from `PUBLICATION_CONSENT_VERSIONS`
 * when the row is written, and a spec keeps that constant equal to the version printed on
 * `docs/legal/acord-lucrari.md`. A new version of the text does not end a consent given under the
 * old one. Whether it should depends on what changed, and that answer belongs to whoever changes it.
 *
 * **It goes with the child.** `CASCADE`, like everything else that hangs off a child: an erased
 * child has no work left to publish, and "the child whose name we erased once agreed" would be the
 * last trace of them anywhere in the platform.
 */
@Entity('publication_consents')
@Index('IDX_publication_consents_child_id', ['child'])
@Index('UQ_publication_consents_one_in_force', ['child', 'purpose'], { unique: true, where: `"revokedAt" IS NULL` })
export class PublicationConsent {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @ManyToOne(() => Child, { onDelete: 'CASCADE', nullable: false })
    @JoinColumn({ name: 'child_id' })
    child: Child;

    @Column({ type: 'enum', enum: PublicationPurpose })
    purpose: PublicationPurpose;

    /** As printed on the text: `0.1`. Text, because a version is a label, not a number. */
    @Column({ type: 'varchar', length: 20 })
    textVersion: string;

    @CreateDateColumn({ type: 'timestamptz' })
    grantedAt: Date;

    @Column({ type: 'enum', enum: ConsentChannel })
    grantedVia: ConsentChannel;

    /** Null while the consent is in force. Set once, and the row is never touched again. */
    @Column({ type: 'timestamptz', nullable: true })
    revokedAt: Date | null;

    @Column({ type: 'enum', enum: ConsentChannel, nullable: true })
    revokedVia: ConsentChannel | null;
}
