import type { ISODate, ISODateTime } from './common';

/**
 * A family's consent to use a child's work, on the wire — E07 S2.
 *
 * Keyed on the child, one entry per purpose, with the whole history: a consent is a row from the
 * day it was given to the day it was taken back, and a new one after that is a new row. Literal
 * unions rather than enums, like the rest of the contract.
 */

/**
 * What the work may be used for. One value today — the school's promotional materials — and the
 * public showcase from E14 S6 joins it the day that showcase exists.
 */
export type PublicationPurpose = 'promotion';

/** Whose hands wrote it down: the parent in the portal, or the office from a paper form or a call. */
export type ConsentChannel = 'portal' | 'office';

export interface PublicationConsentRecord {
    id: number;
    purpose: PublicationPurpose;
    /** The version of the text the family read, as printed on it. */
    textVersion: string;
    grantedAt: ISODateTime;
    grantedVia: ConsentChannel;
    /** Null while it is in force. */
    revokedAt: ISODateTime | null;
    revokedVia: ConsentChannel | null;
}

export interface PurposeConsent {
    purpose: PublicationPurpose;
    /** The version a consent given today would record — what the screen links to. */
    currentVersion: string;
    inForce: PublicationConsentRecord | null;
    /** Newest first, the one in force included. */
    history: PublicationConsentRecord[];
}

/** One child, every purpose. */
export interface ChildConsents {
    childId: number;
    firstName: string;
    lastName: string;
    purposes: PurposeConsent[];
}

/** A family's children, as the portal and the family page show them. */
export interface FamilyConsents {
    profileId: number;
    children: ChildConsents[];
}

/** One child whose work may be used today — the office's list. */
export interface ConsentInForce {
    consentId: number;
    purpose: PublicationPurpose;
    textVersion: string;
    grantedAt: ISODateTime;
    grantedVia: ConsentChannel;
    child: { id: number; firstName: string; lastName: string; birthDate: ISODate };
    family: { id: number; firstName: string; lastName: string };
    group: { id: number; name: string } | null;
}
