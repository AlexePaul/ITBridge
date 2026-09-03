import type { ISODate, ISODateTime } from './common';
import type { Child } from './child';
import type { Group } from './group';

/**
 * A child's work, on its way to that child's parent. E14.
 *
 * The flow the shapes below describe: a teacher saves a file into the child's folder on the network
 * share, the local agent uploads it, an admin looks at what arrived on the group screen and presses
 * send. Nothing leaves automatically, and nothing here is public — the showcase from E14/S6 needs
 * the consent record from E07/S2, which does not exist yet, so no field in this file says "public".
 */

/**
 * Where a document is in that flow — three states, exactly the three E17/S5 asks to see in the
 * group list.
 *
 * A union of literals rather than an `enum`, per the rule this package learned the hard way:
 * Vite's prebundler dropped the body of a new CommonJS enum as dead code and left the import
 * resolving to `undefined`, silently, inside a `computed`. Existing enums stay because they are
 * used as values; nothing new becomes one.
 */
export type ProjectStatus = 'new' | 'sent' | 'error';

/** Romanian, because this is a label on an admin's screen. */
export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
    new: 'Nou',
    sent: 'Trimis',
    error: 'Eroare',
};

/** How the document got here. Both roads are legitimate; the agent is the main one, not the only one. */
export type ProjectSource = 'agent' | 'admin';

export const PROJECT_SOURCE_LABELS: Record<ProjectSource, string> = {
    agent: 'Agent',
    admin: 'Adăugat manual',
};

/**
 * One stored file.
 *
 * `storageKey` is **not** on the wire. It is built from identifiers only — never a child's name —
 * and it still has no business leaving the backend: a parent downloads through
 * `GET /projects/:id/files/:fileId`, which checks the child is theirs and only then signs a URL.
 */
export interface ProjectFile {
    id: number;
    /** The name the teacher saved it under, kept for the download and for recognising it on screen. */
    originalName: string;
    /** Decided from the file's magic bytes, not from its extension. */
    contentType: string;
    sizeBytes: number;
    createdAt: ISODateTime;
}

/**
 * One round of work on the same project. A child who comes back to last week's Scratch file adds a
 * version rather than a second project, so the gallery shows one thing that grew.
 */
export interface ProjectVersion {
    id: number;
    /** 1, 2, 3… within the project. What the interface shows; the id is not a count. */
    versionNumber: number;
    createdAt: ISODateTime;
    files: ProjectFile[];
}

/**
 * Work that lives online rather than in a file: a Tinkercad model, a Canva design, a web page.
 *
 * The catalogue puts Tinkercad and Canva in the youngest group and web pages at 5th–6th grade, so a
 * model that demanded a file would exclude exactly the groups a child starts in.
 */
export interface ProjectLink {
    id: number;
    label: string;
    url: string;
}

export interface Project {
    id: number;
    /**
     * The random identifier a parent's link carries: `/files/<uuid>`. Never the child's name, and
     * never the numeric id — a sequential id in a mailed link is an invitation to try the
     * neighbouring one, even though the endpoint behind it checks who is asking.
     */
    publicId: string;
    child: Child;
    title: string;
    description: string | null;
    /** The day the work was done, not the day it was uploaded. */
    capturedOn: ISODate;
    status: ProjectStatus;
    source: ProjectSource;
    /** True when a thumbnail exists; the bytes come from `GET /projects/:id/thumbnail`. */
    hasThumbnail: boolean;
    versions: ProjectVersion[];
    links: ProjectLink[];
    /** Set when the email went into the queue, together with the address it was addressed to. */
    sentAt: ISODateTime | null;
    sentToEmail: string | null;
    createdAt: ISODateTime;
}

/** Why the agent could not decide whose work a file was. Each reason is a different fix. */
export type UnassignedFileReason =
    'unknown_folder' | 'group_root' | 'extension_not_allowed' | 'too_large' | 'unreadable';

export const UNASSIGNED_FILE_REASON_LABELS: Record<UnassignedFileReason, string> = {
    unknown_folder: 'Folder necunoscut — nu se potrivește cu niciun copil',
    group_root: 'Salvat în rădăcina grupei, nu în folderul unui copil',
    extension_not_allowed: 'Tip de fișier neacceptat',
    too_large: 'Fișier prea mare',
    unreadable: 'Fișierul nu a putut fi citit',
};

/**
 * A file the agent moved to `_neatribuite` instead of uploading.
 *
 * It exists as a row because the alternative is silence: a file nobody can place is information,
 * not a line to skip — the same discipline E17/S5 applies to a parent with no address.
 */
/**
 * What is waiting for somebody to press send, and for how long — E17/S8.
 *
 * The count alone is not a signal, which is why the age travels with it: five documents uploaded
 * this afternoon are a normal afternoon, one uploaded on Tuesday and still here on Friday is the
 * failure the story names — what depends on a button does not go out if nobody presses it.
 */
export interface PendingProjectsSummary {
    /** Every document in `new`, including any whose child is in no group and so is on no group screen. */
    total: number;
    /** Whole days the oldest of them has waited. Null when nothing is waiting. */
    oldestDays: number | null;
    /**
     * The line between "a queue" and "a lapse", in days.
     *
     * On the wire rather than hard-coded in the screen, so the interface says which line it is
     * drawing — the same treatment E21 gives its occupancy threshold. A proposal, not a rule
     * somebody signed.
     */
    staleAfterDays: number;
    /** Oldest-first: the group at the top is the one to open. */
    byGroup: PendingProjectsGroup[];
}

export interface PendingProjectsGroup {
    groupId: number;
    count: number;
    oldestDays: number;
}

export interface UnassignedFile {
    id: number;
    group: Group | null;
    /** Where it sat on the share, relative to the group folder. Enough for an admin to go and look. */
    relativePath: string;
    fileName: string;
    sizeBytes: number;
    reason: UnassignedFileReason;
    reportedAt: ISODateTime;
    resolvedAt: ISODateTime | null;
}

/**
 * The last thing the agent said about itself.
 *
 * The office computer being switched off looks exactly like a quiet day, and that ambiguity is the
 * accepted cost of running one agent instead of one per lab machine. The heartbeat is what makes
 * the two distinguishable: an admin screen can say "the agent has not reported for 3 hours".
 */
export interface AgentStatus {
    id: number;
    agentName: string;
    lastSeenAt: ISODateTime;
    version: string | null;
    watchedRoot: string | null;
    /** How many files were waiting in the folder when it last looked. */
    pendingFiles: number;
    lastError: string | null;
}

/** The folder tree the agent mirrors onto the share, generated from the database. */
export interface AgentMirror {
    locations: AgentMirrorLocation[];
}

export interface AgentMirrorLocation {
    id: number;
    name: string;
    groups: AgentMirrorGroup[];
}

export interface AgentMirrorGroup {
    id: number;
    name: string;
    children: AgentMirrorChild[];
}

/**
 * A child, as a folder name.
 *
 * The id travels with the name because the folder is named after both: two children called Andrei
 * in one group is week three, not an edge case, and a folder somebody renames by hand must not
 * orphan the files inside it.
 */
export interface AgentMirrorChild {
    id: number;
    firstName: string;
    lastName: string;
}

/**
 * Why a ticked document was left where it was.
 *
 * `already_sent` is the one that matters: a second press sends nothing, so a nervous click on a slow
 * connection cannot double a whole group. `upload_incomplete` is a file whose bytes never finished
 * arriving — a link to nothing is worse than a delay.
 */
export type SkippedProjectReason = 'already_sent' | 'upload_incomplete';

export const SKIPPED_PROJECT_REASON_LABELS: Record<SkippedProjectReason, string> = {
    already_sent: 'Trimis deja',
    upload_incomplete: 'Fișierul nu s-a încărcat complet',
};

/** Why a parent could not be written to. Neither case disappears from the report. */
export type UndeliverableReason = 'no_email' | 'email_unconfirmed';

export const UNDELIVERABLE_REASON_LABELS: Record<UndeliverableReason, string> = {
    no_email: 'Fără adresă de email',
    email_unconfirmed: 'Adresa de email nu e confirmată',
};

/** What `POST /projects/send` did, per parent. A report, not a delivery confirmation. */
export interface SendProjectsResult {
    queued: SendProjectsRecipient[];
    /** Documents left alone, with the reason. */
    skipped: { projectId: number; reason: SkippedProjectReason }[];
    /** Parents who cannot be written to. They appear here rather than vanishing from the report. */
    undeliverable: SendProjectsRecipient[];
}

export interface SendProjectsRecipient {
    parentId: number;
    parentName: string;
    email: string | null;
    projectIds: number[];
    /** Only on `undeliverable`. */
    reason?: UndeliverableReason;
}
