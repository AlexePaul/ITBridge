import { EntityManager, In, IsNull, Not } from 'typeorm';
import { Lead } from 'src/entities/lead.entity';

/**
 * The address a family left on the booking form, for the families whose profile has none — E20/S2.
 *
 * `/proba` writes a shell profile with no email and no phone, deliberately: those columns are
 * unique, and a public form must not write into another family's row. The address the family typed
 * stays on the lead, where the booking's confirmation and the trial reminder already read it.
 * Everything else that writes to a family read `profile.email` alone — the class cancelled, the
 * class moved, the group's new day, an announcement to the group — so a family booked for a trial
 * heard none of it: each message became an `undeliverable` row while the address sat one join away,
 * and the family came to a room with nobody in it (review of 25 September 2026).
 *
 * The newest lead wins: a family that asked twice is reachable where it last said. Only the leads
 * the public form linked to a profile are read — one typed by the office has no profile to follow.
 */
export async function bookingAddresses(manager: EntityManager, profileIds: number[]): Promise<Map<number, string>> {
    if (profileIds.length === 0) return new Map();

    const leads = await manager.getRepository(Lead).find({
        where: { profile: { id: In(profileIds) }, parentEmail: Not(IsNull()) },
        relations: { profile: true },
        order: { createdAt: 'DESC', id: 'DESC' },
    });

    const addresses = new Map<number, string>();
    for (const lead of leads) {
        const profileId = lead.profile?.id;
        if (profileId !== undefined && lead.parentEmail && !addresses.has(profileId)) {
            addresses.set(profileId, lead.parentEmail);
        }
    }
    return addresses;
}
