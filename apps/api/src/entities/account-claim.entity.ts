import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Profile } from './profile.entity';
import { User } from './user.entity';

/**
 * One row per link that lets a family the office typed in create its own account.
 *
 * The fourth link of the family `sessions` started — after `email_confirmations` and
 * `password_resets` — and shaped like them: **the token itself is never stored**, only a SHA-256 of
 * it. Unlike those two it hangs off a `Profile`, not a `User`, because the whole point is that there
 * is no account yet: the office wrote the family down from a phone call (`POST /profiles`), and the
 * family now wants to sign in.
 *
 * What the link proves is the mailbox, and that is enough to hand over the family: an account-less
 * profile's address is one the office typed, which `vouchedAddresses` already treats as the
 * family's. So the rules are the password reset's, applied to the moment an account is born:
 *
 * - **A second claim kills the first.** Two live links for one family are two ways in, and the
 *   parent who asked twice is reading the newer mail anyway.
 * - **`email` is frozen at issue and read again at use.** If the office corrects the address in
 *   between, the link travelled to an inbox that is no longer the family's — maybe a stranger's,
 *   when the reason for the correction was a typo — and must stop working.
 * - **Forty-eight hours**, like the confirmation link and not the reset's hour: this one is sent
 *   on the office's initiative as often as the family's, and may well wait for a Sunday morning.
 *   Nothing is open meanwhile — the account it creates still waits for the office's approval.
 * - **The account it creates is not attached to the family until the office approves it** (review
 *   of 26 September 2026). Proving a mailbox proves whoever reads it, and an address the office
 *   mistyped is a stranger's; attached at once, that stranger read the children, the invoices and
 *   the register, and could move the address, before anybody at the school looked. Until approval,
 *   `user` is the only tie between the two — see `claimant.ts`.
 */
@Entity('account_claims')
@Index('IDX_account_claims_profile_id', ['profile'])
@Index('IDX_account_claims_user_id', ['user'])
export class AccountClaim {
    @PrimaryGeneratedColumn('increment')
    id: number;

    /** `CASCADE`: a link to take over a family nobody holds any more points at nothing. */
    @ManyToOne(() => Profile, { onDelete: 'CASCADE', nullable: false })
    @JoinColumn({ name: 'profile_id' })
    profile: Profile;

    /** SHA-256 of the token in the link. Looked up once per click, hence the index. */
    @Index()
    @Column({ type: 'varchar', length: 64, unique: true })
    tokenHash: string;

    /** The address the link was sent to, copied at the time of sending and compared again at use. */
    @Column({ type: 'varchar', length: 255 })
    email: string;

    @CreateDateColumn({ type: 'timestamptz' })
    createdAt: Date;

    /** Also set to the moment a newer link replaced this one, which is what "a second claim kills the first" writes. */
    @Column({ type: 'timestamptz' })
    expiresAt: Date;

    /** Set the moment an account was created from the link. A second use finds this set and is refused. */
    @Column({ type: 'timestamptz', nullable: true })
    usedAt: Date | null;

    /**
     * The account created from the link, set with `usedAt`. Until the office approves it, this is
     * the only thing saying which family the account is for: `profiles.user_id` is written at
     * approval, not here. `CASCADE`: a claim whose account is gone ties nothing to anything.
     */
    @ManyToOne(() => User, { onDelete: 'CASCADE', nullable: true })
    @JoinColumn({ name: 'user_id' })
    user: User | null;
}
