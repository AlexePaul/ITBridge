import { EntityManager } from 'typeorm';
import { AccountClaim } from 'src/entities/account-claim.entity';
import { Profile } from 'src/entities/profile.entity';
import { User } from 'src/entities/user.entity';
import { ApprovalStatus } from 'src/enum/approval-status.enum';

/**
 * An account created from a claim link and not attached to its family yet — the review of 26
 * September 2026.
 *
 * A claim used to attach the new account to the office's row at once. Proving a mailbox proves
 * whoever reads it, though, and an address the office mistyped is a stranger's: attached at once,
 * that stranger read the family's children, invoices and register, downloaded its data and could
 * move its address, all before anybody at the school had looked. The account is now attached when
 * the office approves it (`AccountApprovalService.approve`), and every read of family data, keyed as
 * it is on `profiles.user_id`, sees nothing until then.
 *
 * Meanwhile the claim link the account was created from (`AccountClaim.user`) is the only tie, and
 * the questions "which family does this account wait on" and "which account waits on this family"
 * are the two reads below. An account stops waiting once a profile points at it.
 */

/** Where an account created from a claim link waits: its family, as the office holds it, and the address the link went to. */
export interface ClaimedFamily {
    claimId: number;
    profile: Profile;
    /** The address the link was sent to and the account proved; compared again at approval. */
    email: string;
}

/** Not attached to any family: the account the claim created is still waiting for the office. */
const NOT_ATTACHED = 'NOT EXISTS (SELECT 1 FROM profiles attached WHERE attached.user_id = claimant.id)';

/** The family an account waits on — `null` for an account that was not created from a claim link, or was attached since. */
export async function claimedFamilyOf(manager: EntityManager, userId: number): Promise<ClaimedFamily | null> {
    const claim = await manager
        .getRepository(AccountClaim)
        .createQueryBuilder('claim')
        .innerJoin('claim.user', 'claimant')
        .innerJoinAndSelect('claim.profile', 'profile')
        .andWhere('claimant.id = :userId', { userId })
        .andWhere(NOT_ATTACHED)
        .orderBy('claim.usedAt', 'DESC')
        .getOne();
    return claim ? { claimId: claim.id, profile: claim.profile, email: claim.email } : null;
}

/**
 * The account waiting on a family: the newest one created from its links and not attached yet.
 *
 * `pendingOnly` leaves out an account the office refused. A refused one stops standing in the way of
 * a new link, because the account refused may have been a stranger's, and the family it was
 * refused for may still be the real one, without a way in.
 */
export async function waitingAccountOf(manager: EntityManager, profileId: number, pendingOnly = false): Promise<User | null> {
    const query = manager
        .getRepository(AccountClaim)
        .createQueryBuilder('claim')
        .innerJoinAndSelect('claim.user', 'claimant')
        .innerJoin('claim.profile', 'profile')
        .andWhere('profile.id = :profileId', { profileId })
        .andWhere(NOT_ATTACHED);
    if (pendingOnly) {
        query.andWhere('claimant.approvalStatus = :pending', { pending: ApprovalStatus.PENDING });
    }
    const claim = await query.orderBy('claim.usedAt', 'DESC').getOne();
    return claim?.user ?? null;
}

/** The accounts waiting on each of these families, newest per family — for the lists that show many at once. */
export async function waitingAccountsOf(manager: EntityManager, profileIds: number[]): Promise<Map<number, User>> {
    if (profileIds.length === 0) return new Map();
    const claims = await manager
        .getRepository(AccountClaim)
        .createQueryBuilder('claim')
        .innerJoinAndSelect('claim.user', 'claimant')
        .innerJoinAndSelect('claim.profile', 'profile')
        .andWhere('profile.id IN (:...profileIds)', { profileIds })
        .andWhere(NOT_ATTACHED)
        .orderBy('claim.usedAt', 'ASC')
        .getMany();
    // Oldest first, so a newer claim for the same family overwrites it.
    return new Map(claims.map((claim) => [claim.profile.id, claim.user as User]));
}

/** The families these accounts wait on, for the lists that show many accounts at once — the approvals queue. */
export async function claimedFamiliesOf(manager: EntityManager, userIds: number[]): Promise<Map<number, Profile>> {
    if (userIds.length === 0) return new Map();
    const claims = await manager
        .getRepository(AccountClaim)
        .createQueryBuilder('claim')
        .innerJoinAndSelect('claim.profile', 'profile')
        .innerJoin('claim.user', 'claimant')
        .addSelect('claimant.id')
        .andWhere('claimant.id IN (:...userIds)', { userIds })
        .andWhere(NOT_ATTACHED)
        .orderBy('claim.usedAt', 'ASC')
        .getMany();
    // Oldest first, so the newest claim of an account overwrites any earlier one.
    return new Map(claims.map((claim) => [(claim.user as User).id, claim.profile]));
}
