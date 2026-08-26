import type { Child } from './child';

/**
 * Câmpurile de contact sunt `nullable` în `profile.entity.ts`. Un admin poate crea un profil cu
 * doar nume și prenume, iar `GET /users/without-profile` servește legarea ulterioară de un cont.
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
    /** Calculat, nu stocat: spune dacă profilul are un `User` atașat. */
    hasUser?: boolean;
}
