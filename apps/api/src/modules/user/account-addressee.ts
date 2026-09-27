import { EntityManager } from 'typeorm';
import { Profile } from 'src/entities/profile.entity';
import { User } from 'src/entities/user.entity';
import { claimedFamilyOf } from 'src/modules/auth/claimant';

export interface AccountAddressee {
    /** The family the message is written to — `OutboxMessage.profile`. */
    profileId: number;
    firstName: string | null;
    email: string | null;
    /**
     * Whether the address may be written to (E11/S2). An attached account's, once it proved it — an
     * address edit clears the stamp; a claimant's always, since the claim link it opened was sent
     * there. `queueOrRecord` records a message to an unproven address as `unconfirmed_address`.
     */
    confirmed: boolean;
}

/**
 * Who a message about an account goes to: the family the account belongs to or, for one created from
 * a claim link and not attached yet, the family it claimed — at the address the link was sent to and
 * the account proved, greeting it as the link did. `null` when there is neither, and the sender
 * records the message as undeliverable (E17/S5) rather than skipping it.
 */
export async function accountAddressee(manager: EntityManager, userId: number): Promise<AccountAddressee | null> {
    const profile = await manager.findOne(Profile, { where: { user: { id: userId } } });
    if (profile) {
        const account = await manager.findOne(User, { where: { id: userId }, select: { id: true, emailConfirmedAt: true } });
        return {
            profileId: profile.id,
            firstName: profile.firstName ?? null,
            email: profile.email ?? null,
            confirmed: account?.emailConfirmedAt != null,
        };
    }
    const claimed = await claimedFamilyOf(manager, userId);
    return claimed ? { profileId: claimed.profile.id, firstName: claimed.profile.firstName ?? null, email: claimed.email, confirmed: true } : null;
}
