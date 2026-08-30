import type { Child } from './child';
import type { Group } from './group';
import type { ISODate, ISODateTime } from './common';

/**
 * Mirrors `EnrollmentStatus` in `apps/api/src/enum/enrollment-status.enum.ts`.
 *
 * A union of literals rather than an `enum`: this package describes the wire format, and on the
 * wire this is a string. An `enum` would also be a runtime value, and a runtime value out of this
 * CommonJS package is a hazard in the browser — Vite's pre-bundler has already dropped one enum's
 * initialiser while keeping its export line, which resolved to `undefined` and threw silently
 * inside a `computed`.
 */
export type EnrollmentStatus = 'TRIAL' | 'ACTIVE' | 'COMPLETED' | 'WITHDRAWN' | 'TRANSFERRED';

/**
 * There are deliberately **no runtime values in this file** — no enums, no label maps, no status
 * lists. Two reasons, and the first is the one that cost an afternoon:
 *
 *  - This package is CommonJS and Vite pre-bundles it. A runtime value exported from here can
 *    arrive in the browser as `undefined` — it has happened twice now — and the failure is silent:
 *    the comparison throws inside a `computed`, Vue abandons that subtree, and a card simply does
 *    not render, with a green build and green tests.
 *  - Romanian display strings are not the wire format. This package describes what goes over the
 *    wire, and the wire carries `'TRIAL'`, not `'Probă'`. The labels live next to the screens that
 *    show them, in `apps/web/app/types/enrollment.types.ts`.
 *
 * `Weekday`, `Role` and `WEEKDAY_LABELS` predate this and stay; nothing new joins them.
 */

/** One period of a child's participation in one group — E11/S1. */
export interface Enrollment {
    id: number;
    status: EnrollmentStatus;
    startDate: ISODate;
    /** `null` for exactly the rows still in force. */
    endDate: ISODate | null;
    exitReason: string | null;
    /** The date on the paper contract — E11/D3. The platform stores the fact, not the document. */
    contractSignedAt: ISODate | null;
    createdAt: ISODateTime;
    group?: Group;
    child?: Child;
}

/**
 * Seats in a group, as every screen that shows a number must count them.
 *
 * `taken` is enrolments **in force** — active plus trials booked — never just the active ones. A
 * trial child sits on a chair, at a computer, in the same room (D7).
 */
export interface GroupOccupancy {
    groupId: number;
    capacity: number;
    taken: number;
    free: number;
    /** How many families are queueing for this group, offered or waiting. */
    waiting: number;
}

/** Mirrors `WaitlistStatus` in `apps/api/src/enum/waitlist-status.enum.ts`. */
export type WaitlistStatus = 'WAITING' | 'OFFERED' | 'ACCEPTED' | 'DECLINED' | 'EXPIRED' | 'CANCELLED';

/** A request for a seat in a full group — E11/S3. Order on the list is `createdAt`, ascending. */
export interface WaitlistEntry {
    id: number;
    status: WaitlistStatus;
    createdAt: ISODateTime;
    offeredAt: ISODateTime | null;
    /** The deadline named in the offer mail. `null` until a seat is offered. */
    respondBy: ISODateTime | null;
    note: string | null;
    child?: Child;
    group?: Group;
}

/**
 * One row of the group-formation screen — E11/S7: children nobody has placed, bucketed by age band
 * and by the location they asked for.
 *
 * `locationId` is `null` for children who are on nobody's waiting list — they have expressed no
 * preference, so they count towards a new group anywhere.
 */
export interface DemandBucket {
    locationId: number | null;
    locationName: string;
    ageBand: string;
    children: { id: number; firstName: string; lastName: string; age: number }[];
}
