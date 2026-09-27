import { EntityManager, IsNull, Not } from 'typeorm';
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

/**
 * Whether the family has an account, asked on its own rather than read off a relation the caller
 * happened to load — and so without loading the account into a row that is also returned.
 */
export async function familyHasAccount(manager: EntityManager, profileId: number | null | undefined): Promise<boolean> {
    if (!profileId) return false;
    return manager.getRepository(Profile).exists({ where: { id: profileId, user: { id: Not(IsNull()) } } });
}
