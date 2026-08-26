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
}

export interface Profile extends ProfileSummary {
    children: Child[];
    /** Derived, not stored: tells whether the profile has a `User` attached. */
    hasUser?: boolean;
}
