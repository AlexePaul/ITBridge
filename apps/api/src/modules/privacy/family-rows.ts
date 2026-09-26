import { Raw, type FindOperator, type FindOptionsWhere } from 'typeorm';
import { sameAddress } from 'src/common/same-address';
import type { Lead } from 'src/entities/lead.entity';
import type { OutboxMessage } from 'src/entities/outbox-message.entity';
import type { Profile } from 'src/entities/profile.entity';
import type { User } from 'src/entities/user.entity';

/**
 * As much of a family as either privacy flow needs to find the rows that are theirs.
 *
 * `null` as well as `undefined`, unlike `Profile`'s own `email?: string`: both columns are nullable
 * and the erasure itself writes `null` into them, so a row read back from the database really does
 * carry it. The same reason `isProfileComplete` widens them.
 *
 * **`user` has to be loaded, and the difference between its two empty values is the rule.** `null`
 * is what TypeORM hands back for a relation it joined and found nothing on: a family with no
 * account. `undefined` is a relation nobody asked for, and it is read as the strictest case rather
 * than as "no account" — see `vouchedAddresses`.
 */
export interface FamilyIdentity {
    id: Profile['id'];
    email?: string | null;
    phone?: string | null;
    user?: Pick<User, 'emailConfirmedAt'> | null;
}

/**
 * The addresses a row with no link to the family may be claimed through.
 *
 * Two tables have no relation to a profile — `outbox`, which is shared and also writes to the
 * office, and `leads` an admin typed in from a phone call — so both privacy flows search them by
 * address. That is only as sound as the address, and **the address on a profile is whatever was
 * typed into it.** `PUT /profiles/:id` checks that no other *profile* holds a number or a mailbox,
 * and nothing more: the office's address, or the number of a family who telephoned and never
 * registered, both pass. Matched as typed, `GET /privacy/export` handed that family's child — name,
 * birth date, the trial — to whoever typed the number, and the office's every registration notice
 * to whoever typed its address; the erasure deleted them.
 *
 * So an address claims a row only when somebody the school trusts stands behind it:
 *
 * - **A family with an account: its e-mail, once confirmed.** Opening the link sent to an address is
 *   the one proof the platform has that the family reads it, and any edit of the address clears the
 *   stamp (E11/S2). This is the test the mail queue already applies before writing to an address.
 * - **A family with no account: both, as the office typed them.** Nobody but an admin can edit such
 *   a row, so the office wrote the address on both sides — the family and the enquiry from the same
 *   call. It is the same line `announcement.service.ts` draws for "confirmed".
 * - **A telephone number on an account: never.** Nothing in the platform proves one. The price is a
 *   lead with a number and no e-mail, which neither flow can now find for a family with an account;
 *   it goes on its own term instead — the year of silence in `retention.rules.ts`.
 */
export function vouchedAddresses(family: FamilyIdentity): { email: string | null; phone: string | null } {
    if (family.user === null) return { email: family.email ?? null, phone: family.phone ?? null };
    if (family.user === undefined) return { email: null, phone: null };
    return { email: family.user.emailConfirmedAt ? (family.email ?? null) : null, phone: null };
}

/**
 * Which `leads` rows belong to a family — E07/S4.
 *
 * **The link is not enough.** `Lead.profile` is written by exactly one caller, the public trial
 * form (E20/S2), which creates a shell profile as it books. A lead an admin types in from a phone
 * call has `profile` and `child` both null and no way to acquire either, so the family that first
 * rang the school and only later registered has a row carrying their name, their address, their
 * telephone number and their child's name and date of birth, with nothing pointing at it. Matched
 * by the link alone, the export does not return that row and the erasure does not delete it — and
 * the whole content of the second failure is that the school told a family their data was gone
 * while it was not.
 *
 * So the address is used as well, exactly as the outbox already is and for the same stated reason:
 * a table with no usable relation is searched by what the family is reachable at — **as far as
 * `vouchedAddresses` lets it.** An address being unique among profiles does not make it the
 * family's; being vouched for does.
 *
 * **What it still cannot find** is a lead left at an address the family has since changed. That is
 * the same blind spot the outbox has, it has the same cause — no relation, only an address, and no
 * history of addresses — and it is written down here rather than discovered later.
 */
export function leadsOfFamily(family: FamilyIdentity): FindOptionsWhere<Lead>[] {
    const clauses: FindOptionsWhere<Lead>[] = [{ profile: { id: family.id } }];
    const { email, phone } = vouchedAddresses(family);
    if (email) clauses.push({ parentEmail: sameMailbox(email) });
    if (phone) clauses.push({ parentPhone: phone });
    return clauses;
}

/**
 * An address as the rest of the platform reads one: one mailbox, whatever its capitals — the rule of
 * `sameAddress` and of `UQ_profiles_email_lower`. These three lookups compared exactly, so the family
 * registered as `Ana.Pop@gmail.com` did not find the enquiry the office typed as `ana.pop@gmail.com`,
 * and the erasure left that child's name and birth date behind (review of 25 September 2026).
 */
function sameMailbox(email: string): FindOperator<string> {
    // `Raw` is typed as returning `FindOperator<any>` whatever it is given. Narrowed from `unknown`
    // rather than asserted twice, which `lint:fix` would strip — see CLAUDE.md on `lint:fix` and types.
    const operator: unknown = Raw((column) => `lower(${column}) = lower(:mailbox)`, { mailbox: email.trim() });
    return operator as FindOperator<string>;
}

/**
 * Which `outbox` rows belong to a family — the messages sent to its vouched address.
 *
 * `null` when there is none, rather than a clause the caller could run: `where: { to: undefined }`
 * drops the condition instead of matching nothing, and an erasure would take the whole queue.
 */
export function messagesOfFamily(family: FamilyIdentity): FindOptionsWhere<OutboxMessage> | null {
    const { email } = vouchedAddresses(family);
    return email ? { to: sameMailbox(email) } : null;
}

/** Whether a lead with no link belongs to this family by address — the retention pass's question. */
export function claimsLead(family: FamilyIdentity, lead: Pick<Lead, 'parentEmail' | 'parentPhone'>): boolean {
    const { email, phone } = vouchedAddresses(family);
    return Boolean((email && lead.parentEmail && sameAddress(email, lead.parentEmail)) || (phone && phone === lead.parentPhone));
}
