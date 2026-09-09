import type { Child } from './child';

/**
 * Contact fields are nullable in `profile.entity.ts`. An admin can create a profile with nothing but
 * a first and last name, and `GET /users/without-profile` serves the later account linking.
 */
export interface ProfileSummary {
    id: number;
    firstName: string;
    lastName: string;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    /**
     * Who to call when a child is hurt and the parent does not answer. Required of a parent who
     * registers (E11/S2), absent on the profiles an admin types in from a phone call — hence
     * nullable here, like the contact fields above it.
     */
    emergencyContactName?: string | null;
    emergencyContactRelation?: string | null;
    emergencyContactPhone?: string | null;
    /**
     * Whether the family agreed to hear from the school beyond their own business — E17/S4.
     *
     * Gates marketing and nothing else. Invoices, receipts, a cancelled class and the child's own
     * work are the school performing its contract, and are never on a checkbox.
     */
    marketingOptIn: boolean;
    /**
     * When the family asked for the account to be erased, and when it was carried out — E07/S4.
     *
     * `string`, not `Date`: this describes the wire, and `JSON.stringify` is what a controller
     * returns. Both nullable and both usually null — a family that has not asked has neither.
     *
     * The portal reads `erasureRequestedAt` to show the request standing rather than offering it
     * again, and `erasedAt` is what tells a screen that an emptied row is a shell rather than a
     * family nobody has filled in yet.
     */
    erasureRequestedAt?: string | null;
    erasedAt?: string | null;
}

export interface Profile extends ProfileSummary {
    children: Child[];
    /** Derived, not stored: tells whether the profile has a `User` attached. */
    hasUser?: boolean;
}
