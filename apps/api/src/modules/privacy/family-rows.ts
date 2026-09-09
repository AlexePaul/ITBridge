import type { FindOptionsWhere } from 'typeorm';
import type { Lead } from 'src/entities/lead.entity';
import type { Profile } from 'src/entities/profile.entity';

/**
 * As much of a family as either privacy flow needs to find the rows that are theirs.
 *
 * `null` as well as `undefined`, unlike `Profile`'s own `email?: string`: both columns are nullable
 * and the erasure itself writes `null` into them, so a row read back from the database really does
 * carry it. The same reason `isProfileComplete` widens them.
 */
export interface FamilyIdentity {
    id: Profile['id'];
    email?: string | null;
    phone?: string | null;
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
 * a table with no usable relation is searched by what the family is reachable at. It is safe to do
 * here because `Profile.email` and `Profile.phone` are both unique, so an address identifies one
 * family or nobody; and it can only ever find *more* rows, never fewer.
 *
 * **What it still cannot find** is a lead left at an address the family has since changed. That is
 * the same blind spot the outbox has, it has the same cause — no relation, only an address, and no
 * history of addresses — and it is written down here rather than discovered later.
 */
export function leadsOfFamily(family: FamilyIdentity): FindOptionsWhere<Lead>[] {
    const clauses: FindOptionsWhere<Lead>[] = [{ profile: { id: family.id } }];
    if (family.email) clauses.push({ parentEmail: family.email });
    if (family.phone) clauses.push({ parentPhone: family.phone });
    return clauses;
}
