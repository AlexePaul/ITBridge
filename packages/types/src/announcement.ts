import type { ISODateTime } from './common';
import type { DeliveryFailureReason, DeliveryStatus } from './mail';

/**
 * Announcements — E17/S7, the one message the school sends to more than one family at a time.
 *
 * The rule that shapes every shape below: an announcement addresses a **group, a location or the
 * whole school**, and must not carry anything about a particular child. That is why there is no
 * "one family" audience here, and why the preview carries `warnings`.
 */

/** Mirrors `AnnouncementAudience` in `apps/api/src/enum/announcement-audience.enum.ts`. */
export type AnnouncementAudience = 'group' | 'location' | 'all';

/**
 * Mirrors `MessageKind` in `apps/api/src/enum/message-kind.enum.ts`.
 *
 * `transactional` is the school performing its contract — a day off, a room change — and reaches
 * every family. `marketing` is everything a family may decline, and consults `Profile.marketingOptIn`.
 */
export type AnnouncementKind = 'transactional' | 'marketing';

/**
 * The audience, broken down before anything leaves.
 *
 * Several numbers rather than one because "42 de familii" hides that four of them have no address
 * to write to — and those four are exactly the ones somebody has to phone instead.
 */
export interface AnnouncementAudienceBreakdown {
    total: number;
    deliverable: number;
    noAddress: number;
    unconfirmedAddress: number;
    /** Marketing only. Always zero on a transactional announcement, which consults no preference. */
    declined: number;
}

/** What the preview answers: the real composed message, the audience, and what looks wrong. */
export interface AnnouncementPreview {
    audienceLabel: string;
    recipients: AnnouncementAudienceBreakdown;
    subject: string;
    bodyText: string;
    bodyHtml: string;
    /**
     * Children's first names found in the subject or body.
     *
     * A warning, not a refusal: Maria is a room as often as a child. Sending anyway means repeating
     * the request with `acknowledgeWarnings`, the same two-step E11/S6 uses for the age check.
     */
    warnings: string[];
}

export interface AnnouncementUndeliverableRecipient {
    parentId: number;
    parentName: string;
    reason: DeliveryFailureReason;
}

/** What comes back from a send: the record's id, and who could not be written to. */
export interface AnnouncementResult {
    id: number;
    audienceLabel: string;
    queued: number;
    declined: number;
    undeliverable: AnnouncementUndeliverableRecipient[];
}

/** One row of the announcement history, with counts read off the queue as it stands now. */
export interface AnnouncementSummary {
    id: number;
    audience: AnnouncementAudience;
    /** Set only when the audience was a group. */
    groupName: string | null;
    /** Set only when the audience was a location. */
    locationName: string | null;
    kind: AnnouncementKind;
    subject: string;
    /** What the admin typed, without the per-recipient greeting and signature. */
    bodyText: string;
    /** Null when the account that sent it has since been deleted; the broadcast still happened. */
    sentByUsername: string | null;
    recipientCount: number;
    declinedCount: number;
    createdAt: ISODateTime;
    deliveries: Record<DeliveryStatus, number>;
}

/** One announcement plus every message it produced — the delivery report of the story's acceptance. */
export interface AnnouncementDetail extends AnnouncementSummary {
    messages: {
        id: number;
        to: string;
        status: DeliveryStatus;
        undeliverableReason: DeliveryFailureReason | null;
        lastError: string | null;
        sentAt: ISODateTime | null;
    }[];
}

/** The compose form. The same body feeds preview, test send and the broadcast itself. */
export interface SendAnnouncementDto {
    audience: AnnouncementAudience;
    groupId?: number;
    locationId?: number;
    kind?: AnnouncementKind;
    subject: string;
    body: string;
    acknowledgeWarnings?: boolean;
}
