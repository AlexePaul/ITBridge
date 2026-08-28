/**
 * One of the school's physical addresses.
 *
 * `slug`, `latitude` and `longitude` are carried from the start because the public location pages
 * and their `LocalBusiness` structured data need them (E19); the admin screens use the rest.
 */
export interface Location {
    id: number;
    /** How the location is referred to in running text: "Drumul Taberei". */
    name: string;
    slug: string;
    street: string;
    city: string;
    district: string | null;
    postalCode: string | null;
    latitude: number;
    longitude: number;
    phone: string | null;
    email: string | null;
    /** `null` when the school-wide opening hours apply, which is the usual case. */
    openingHours: string | null;
    isActive: boolean;
}
