import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity';

/**
 * One row per confirmation link sent to a parent — the first gate of E11/S2.
 *
 * Modelled on `Session` and for the same reason: **the token itself is never stored**, only a
 * SHA-256 of it. A link in an inbox is a bearer credential; a leaked backup of this table must not
 * hand somebody a set of accounts whose addresses they can then claim as verified.
 *
 * A row, rather than a pair of columns on `User`, because a confirmation has a life of its own: it
 * expires, it is consumed exactly once, and it can be reissued without disturbing the account. The
 * old link keeps working until it expires — invalidating it on resend would punish the parent who
 * clicks the first mail after asking for a second.
 */
@Entity('email_confirmations')
export class EmailConfirmation {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
    @JoinColumn({ name: 'user_id' })
    user: User;

    /** SHA-256 of the token in the link. Looked up once per click, hence the index. */
    @Index()
    @Column({ type: 'varchar', length: 64, unique: true })
    tokenHash: string;

    /**
     * The address the link was sent to, copied at the time of sending.
     *
     * Not read from `Profile.email` at confirmation time on purpose: a parent who changes their
     * address must not be able to confirm the new one by clicking a link that was sent to the old.
     * Confirming proves that *this* address received *this* token, and that only holds if the
     * address is the one the token travelled to.
     */
    @Column({ type: 'varchar', length: 255 })
    email: string;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;

    @Column({ type: 'timestamptz' })
    expiresAt: Date;

    /** Set the moment the link is opened. A second click on the same link finds this set and is refused. */
    @Column({ type: 'timestamptz', nullable: true })
    consumedAt: Date | null;
}
