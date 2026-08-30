import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, OneToOne } from 'typeorm';
import { Profile } from './profile.entity';
import { Role } from '../enum/role.enum';
import { ApprovalStatus } from '../enum/approval-status.enum';

@Entity('users')
export class User {
    @PrimaryGeneratedColumn('increment')
    id: number;

    @Column({ unique: true, length: 30 })
    username: string;

    @Column({ type: 'varchar', length: 255 })
    passwordHash: string;

    // An enum column, so `'admin'` in the wrong case cannot be written at all. The `Role` enum
    // already existed and was used everywhere except here, where the type was a bare string union.
    @Column({ type: 'enum', enum: Role })
    role: Role;

    @CreateDateColumn({
        type: 'timestamptz',
        default: () => 'CURRENT_TIMESTAMP',
    })
    createdAt: Date;

    /**
     * When the parent opened the link sent to the address they registered with — the first of the
     * two gates from E11/S2. `null` means the address is a string somebody typed, not a place mail
     * arrives.
     *
     * Accounts that existed before the gates did are stamped as confirmed by the migration. They
     * were created when nothing asked, and locking them out retroactively would be a data change
     * dressed up as a rule.
     */
    @Column({ type: 'timestamptz', nullable: true })
    emailConfirmedAt: Date | null;

    /** The admin's verdict — the second gate. See `ApprovalStatus` for why it is not one column with the first. */
    @Column({ type: 'enum', enum: ApprovalStatus, default: ApprovalStatus.PENDING })
    approvalStatus: ApprovalStatus;

    /** When the verdict was given, whichever way it went. `null` while pending. */
    @Column({ type: 'timestamptz', nullable: true })
    approvalDecidedAt: Date | null;

    /**
     * Why an account was refused, in the admin's words. Shown to nobody but another admin — a
     * rejected parent is told the school will be in touch, not handed the note.
     */
    @Column({ type: 'varchar', length: 500, nullable: true })
    rejectionReason: string | null;

    @OneToOne(() => Profile, (profile) => profile.user)
    profile?: Profile;
}

/**
 * Whether this account may actually be used — both gates open.
 *
 * A function rather than a column, because a column would be a third fact that can disagree with
 * the two it summarises. Admins are exempt: they are promoted by hand through the database or
 * `PUT /users/:id`, never through `register`, so there is nobody to confirm their address or
 * approve them.
 */
export function isAccountActive(user: Pick<User, 'role' | 'emailConfirmedAt' | 'approvalStatus'>): boolean {
    if (user.role === Role.ADMIN) return true;
    return user.emailConfirmedAt !== null && user.approvalStatus === ApprovalStatus.APPROVED;
}
