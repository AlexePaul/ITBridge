import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity';

/**
 * One row per reset link sent to a parent who cannot get in.
 *
 * Modelled on `EmailConfirmation`, which is modelled on `Session`, and for the same reason: **the
 * token itself is never stored**, only a SHA-256 of it. A link in an inbox is a bearer credential,
 * and this one is worth more than the confirmation link — it does not prove an address, it opens an
 * account. A leaked backup of this table must not be a set of keys.
 *
 * The differences from a confirmation row are all consequences of that:
 *
 * - **An hour, not forty-eight.** A confirmation link is allowed to wait for somebody's Sunday
 *   morning; a reset link is used within minutes of being asked for, and every hour it stays alive
 *   is an hour it can be found in a forwarded mail or a shared inbox.
 * - **Asking again kills the previous link.** Two live reset tokens for one account is two chances
 *   for the wrong person, and the parent who asked twice is looking at the newer mail anyway.
 *   `EmailConfirmation` deliberately does the opposite, because there the cost of invalidating is a
 *   family who clicks the older mail and is told off for it — nothing is lost but a click. Here the
 *   cost of *not* invalidating is an open door.
 * - **`email` is the address the link went to**, frozen at issue, exactly as on a confirmation: if
 *   the address on the account changes afterwards, this token belonged to the old inbox and must
 *   stop working. That is `CONFIRMATION_TOKEN_SUPERSEDED` reasoning, applied where the stakes are
 *   the account rather than a flag on it.
 */
@Entity('password_resets')
@Index('IDX_password_resets_user_id', ['user'])
export class PasswordReset {
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
     * Read back at reset time and compared with the address on the account now. A parent whose
     * address was corrected between asking and clicking is holding a token that travelled to an
     * inbox which is no longer theirs — and if the reason for the correction was a typo, that inbox
     * may be a stranger's.
     */
    @Column({ type: 'varchar', length: 255 })
    email: string;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;

    @Column({ type: 'timestamptz' })
    expiresAt: Date;

    /** Set the moment the password is changed. A second use of the same link finds this set and is refused. */
    @Column({ type: 'timestamptz', nullable: true })
    consumedAt: Date | null;
}
