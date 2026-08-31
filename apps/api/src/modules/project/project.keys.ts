import { createHash } from 'crypto';

/**
 * Where a project's objects live, and what makes an upload idempotent. E14/S1 and S2.
 *
 * Everything here is derived, never stored. Two places that can each say where an object lives will
 * eventually disagree, and the disagreement is silent: the object is simply not found. The invoice
 * module reached the same conclusion the expensive way — the parent's *name* was part of the key
 * and was rebuilt from the current profile at download time, so one rename made every invoice that
 * family had ever received unreachable, with the objects still sitting in the bucket under the old
 * spelling.
 *
 * **Identifiers only.** No child's name, no group, no file name. Beyond the rename problem, the key
 * travels: it goes into signed URLs, into request logs, and into the outbox row that carries a
 * thumbnail. A name in it is a leak in three places at once.
 */

/** The prefix E14 shares with `invoices/` inside the one bucket. */
export const PROJECTS_PREFIX = 'projects';

/** One stored file: `projects/{projectId}/{versionId}/{fileId}`. Exactly the shape E14/S1 specifies. */
export function projectFileKey(projectId: number, versionId: number, fileId: number): string {
    return `${PROJECTS_PREFIX}/${projectId}/${versionId}/${fileId}`;
}

/**
 * The generated thumbnail: `projects/{projectId}/thumb.jpg`.
 *
 * On the project rather than on the version, because a thumbnail answers "what is this?" and that
 * does not change when a child comes back to improve it — the newest version simply replaces the
 * picture in place.
 */
export function projectThumbnailKey(projectId: number): string {
    return `${PROJECTS_PREFIX}/${projectId}/thumb.jpg`;
}

/**
 * The idempotency key for one upload: `{childId}:{sha256 of the bytes}`.
 *
 * **Derived from content, never from the name.** A teacher who saves `proiect.sb3` in week one and
 * again in week three has produced two different files with one name; a network hiccup that makes
 * the agent retry has produced one file offered twice. Keying on the name gets both cases wrong,
 * in opposite directions.
 *
 * Scoped to the child so that two children who legitimately save the same starter file — handed out
 * by the teacher at the beginning of a module — each get their own project. Without the scope, the
 * second child's upload would be swallowed as a duplicate of the first child's, and one family
 * would silently receive nothing.
 */
export function ingestionKey(childId: number, contentHash: string): string {
    return `${childId}:${contentHash}`;
}

/** SHA-256, hex. The agent computes the same value locally and sends it, so a mismatch is detectable. */
export function hashContent(bytes: Buffer): string {
    return createHash('sha256').update(bytes).digest('hex');
}
