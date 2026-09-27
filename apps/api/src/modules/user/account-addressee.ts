import { EntityManager } from 'typeorm';
import { Profile } from 'src/entities/profile.entity';
import { claimedFamilyOf } from 'src/modules/auth/claimant';

export interface AccountAddressee {
    firstName: string | null;
    email: string | null;
}

/**
 * Who a message about an account goes to: the family the account belongs to or, for one created from
 * a claim link and not attached yet, the family it claimed — at the address the link was sent to and
 * the account proved, greeting it as the link did. `null` when there is neither, and the sender
 * records the message as undeliverable (E17/S5) rather than skipping it.
 */
export async function accountAddressee(manager: EntityManager, userId: number): Promise<AccountAddressee | null> {
    const profile = await manager.findOne(Profile, { where: { user: { id: userId } } });
    if (profile) return { firstName: profile.firstName ?? null, email: profile.email ?? null };
    const claimed = await claimedFamilyOf(manager, userId);
    return claimed ? { firstName: claimed.profile.firstName ?? null, email: claimed.email } : null;
}
