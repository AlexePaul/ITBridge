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
}

export interface Profile extends ProfileSummary {
    children: Child[];
    /** Derived, not stored: tells whether the profile has a `User` attached. */
    hasUser?: boolean;
}
