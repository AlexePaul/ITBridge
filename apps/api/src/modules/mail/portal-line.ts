import { EntityManager } from 'typeorm';
import { Profile } from 'src/entities/profile.entity';
import { contactUrl } from 'src/modules/auth/portal-urls';

/**
 * The line before the link at the bottom of a message to a family, and the link.
 *
 * The portal is a door only for a family with an account. A family the office typed in from a phone
 * call has an address and no account — the path most families take into the school — and the
 * messages about its classes and its money sent it to a login it has nothing to type into (QA of
 * 26 and 27 September 2026). Such a family is sent to the contact page instead, with a sentence
 * that says what to ask for there.
 */
export const NO_ACCOUNT_NOTE = 'Pentru orice întrebare, ne găsești aici:';

export function familyLink(
    hasAccount: boolean,
    account: { note: string; url: string },
    noAccountNote: string = NO_ACCOUNT_NOTE,
): { portalNote: string; portalUrl: string } {
    return hasAccount ? { portalNote: account.note, portalUrl: account.url } : { portalNote: noAccountNote, portalUrl: contactUrl() };
}

/** What a message to a family needs to know about its account, read in the sender's transaction. */
export interface FamilyAccount {
    /**
     * An account is attached and not suspended, so the portal is a door the family can open. A
     * suspended family is still written to about its classes and its money (terms §14), but a link to
     * a login that answers "suspendat" is not where to send it.
     */
    canSignIn: boolean;
    /**
     * Whether the family's address may be written to (E11/S2, CLAUDE.md): one the office typed in, on
     * the office's word; one with an account, once the account has proven it — an address edit clears
     * the stamp, and until the new address is proven the message is an `unconfirmed_address` row in
     * Livrări rather than the school's words in a stranger's inbox.
     */
    addressProven: boolean;
}

/**
 * The family's account, asked on its own rather than read off a relation the caller happened to load
 * — and so without loading the account into a row that is also returned. No profile has no address
 * either, and `queueOrRecord` records that as `no_address`.
 */
export async function familyAccount(manager: EntityManager, profileId: number | null | undefined): Promise<FamilyAccount> {
    if (!profileId) return { canSignIn: false, addressProven: true };
    const profile = await manager.getRepository(Profile).findOne({
        where: { id: profileId },
        relations: { user: true },
        select: { id: true, user: { id: true, emailConfirmedAt: true, suspendedAt: true } },
    });
    const user = profile?.user ?? null;
    return {
        canSignIn: user !== null && user.suspendedAt === null,
        addressProven: user === null || user.emailConfirmedAt !== null,
    };
}
