import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from './user.entity';

/**
 * One row per issued refresh token, so a refresh token can be revoked.
 *
 * Refresh tokens used to be purely stateless: valid for seven days, with no logout and no way to
 * take one back. A stolen token stayed usable for a week no matter what anyone did.
 *
 * The token itself is never stored — only a SHA-256 of it. A leaked backup of this table must not
 * hand somebody a working set of sessions.
 */
@Entity('sessions')
export class Session {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: false })
    @JoinColumn({ name: 'user_id' })
    user: User;

    /** SHA-256 of the refresh token. Looked up on every refresh, hence the index. */
    @Index()
    @Column({ type: 'varchar', length: 64, unique: true })
    tokenHash: string;

    /**
     * Chain identifier, shared by every token descended from one login. Reusing a token that was
     * already rotated revokes the whole chain — the standard signal that a token was stolen, since
     * the legitimate client and the thief cannot both hold the newest one.
     */
    @Index()
    @Column({ type: 'uuid' })
    familyId: string;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;

    @Column({ type: 'timestamptz' })
    expiresAt: Date;

    /** Set when the token is rotated, on logout, or when the family is revoked after a reuse. */
    @Column({ type: 'timestamptz', nullable: true })
    revokedAt: Date | null;

    /** Truncated: enough to tell sessions apart in a list, not a fingerprint. */
    @Column({ type: 'varchar', length: 255, nullable: true })
    userAgent: string | null;
}
