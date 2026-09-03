import type { Child } from './child';

/** Mirrors `MessageFrequency` in `apps/api/src/enum/message-frequency.enum.ts`. */
export type MessageFrequency = 'immediate' | 'daily' | 'weekly';

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
     * How often the family wants their post — E17/S6. Mirrors `MessageFrequency` in
     * `apps/api/src/enum/message-frequency.enum.ts`.
     *
     * The opposite of the switch above in the way that matters: this **cannot suppress anything**.
     * A family on `weekly` receives everything a family on `immediate` does, in fewer envelopes,
     * and anything urgent ignores it entirely — which is what makes `daily` a safe default.
     */
    messageFrequency: MessageFrequency;
}

export interface Profile extends ProfileSummary {
    children: Child[];
    /** Derived, not stored: tells whether the profile has a `User` attached. */
    hasUser?: boolean;
}
