import * as fs from 'fs';
import * as path from 'path';
import type { AgentMirror } from '@itbridge/types';
import {
    childFolderName,
    childIdFromFolder,
    groupIdFromFolder,
    groupPath,
    IGNORED_DIRS,
    legacyGroupPath,
    safeFolderName,
    UNASSIGNED_DIR,
} from './paths';
import { log } from './log';

/**
 * Rebuilds the folder tree on the share from what the database says. E14/S2.
 *
 * **The mirror is generated; it is not the source of truth.** Folders are created and renamed to
 * match, and a folder somebody made by hand simply maps to no child — the file that lands in it
 * becomes an `UnassignedFile` rather than a guess.
 *
 * **Nothing is ever deleted.** A child who leaves, or a group that ends, keeps its folder: the work
 * inside it is a family's, and a mirror that tidied up after itself would delete it on the first
 * pass after somebody was moved. Emptying the share is a decision for a person, in Explorer.
 */
export function applyMirror(root: string, mirror: AgentMirror): { created: number; renamed: number } {
    let created = 0;
    let renamed = 0;

    fs.mkdirSync(root, { recursive: true });
    const current = currentGroupFolders(root, mirror);

    for (const location of mirror.locations) {
        for (const group of location.groups) {
            const wanted = groupPath(root, location.name, group);
            let groupDir = current.get(group.id) ?? null;

            if (groupDir && groupDir !== wanted) {
                // The group was renamed, moved to the other address, or its folder was made by a
                // build before folders carried the group's id. The folder follows, with everything
                // teachers saved in it — the same reason the child's folder follows its child.
                try {
                    fs.mkdirSync(path.dirname(wanted), { recursive: true });
                    fs.renameSync(groupDir, wanted);
                    groupDir = wanted;
                    renamed++;
                } catch (error) {
                    // A file open in Scratch keeps the folder locked. Nothing is lost: the folder
                    // still carries the id, so the scanner still walks it where it is, and the move
                    // is tried again next time. Ids only, never a name, in the log.
                    log.warn(
                        `Could not move the folder of group ${group.id}: ${error instanceof Error ? error.message : String(error)}`,
                    );
                }
            }
            if (!groupDir) {
                created += ensureDir(wanted);
                groupDir = wanted;
            }
            // Every group gets one, empty or not: a teacher who saves into the wrong place needs
            // somewhere for the file to end up, and creating it lazily would mean the first stray
            // file of the year arrives before the folder that catches it.
            created += ensureDir(path.join(groupDir, UNASSIGNED_DIR));

            const existing = listChildFolders(groupDir);

            for (const child of group.children) {
                const wantedChild = childFolderName(child);
                const current = existing.get(child.id);

                if (!current) {
                    created += ensureDir(path.join(groupDir, wantedChild));
                    continue;
                }
                if (current !== wantedChild) {
                    // A child whose name was corrected in the database. The folder follows, and the
                    // files inside it come along — which is the whole reason the id is in the name
                    // rather than the name being the identifier.
                    try {
                        fs.renameSync(path.join(groupDir, current), path.join(groupDir, wantedChild));
                        renamed++;
                    } catch (error) {
                        // A file open in Scratch keeps its folder locked on Windows. Nothing is
                        // lost: the old folder still carries the id, so the scanner still places
                        // its files correctly, and the rename is tried again next time.
                        log.warn(
                            `Could not rename a child folder in group ${group.id}: ${error instanceof Error ? error.message : String(error)}`,
                        );
                    }
                }
            }
        }
    }

    return { created, renamed };
}

/**
 * The folder each group in the mirror is in right now, when it has one: found by the id in its name
 * under whichever location folder it sits, or else the folder an earlier build made for it.
 *
 * Shared with the scanner, which walks a group where its folder *is*, not where it should be: a
 * folder the mirror has not moved yet — renamed group, other address, locked by an open file — is
 * still the one with the teachers' files in it.
 */
export function currentGroupFolders(root: string, mirror: AgentMirror): Map<number, string> {
    const found = findGroupFolders(root);
    const claims = legacyNameCounts(root, mirror);
    const folders = new Map<number, string>();

    for (const location of mirror.locations) {
        for (const group of location.groups) {
            const folder = found.get(group.id) ?? adoptableLegacyFolder(root, location.name, group.name, claims);
            if (folder) folders.set(group.id, folder);
        }
    }
    return folders;
}

/** Every folder under the root that carries a group's id, by that id. */
function findGroupFolders(root: string): Map<number, string> {
    const byId = new Map<number, string>();

    for (const location of readDirSafe(root)) {
        if (!location.isDirectory() || IGNORED_DIRS.has(location.name)) continue;
        const locationDir = path.join(root, location.name);
        for (const entry of readDirSafe(locationDir)) {
            if (!entry.isDirectory()) continue;
            const id = groupIdFromFolder(entry.name);
            if (id !== null && !byId.has(id)) byId.set(id, path.join(locationDir, entry.name));
        }
    }

    return byId;
}

/**
 * A folder an earlier build made for this group, named after the group alone, when it is safe to
 * say it is this group's: it exists, and no other group in the mirror would have been given the same
 * one. Two groups sharing a name at one address shared that folder, so it belongs to neither and is
 * left where it is, for a person to sort out.
 */
function adoptableLegacyFolder(
    root: string,
    locationName: string,
    groupName: string,
    claims: Map<string, number>,
): string | null {
    const legacy = legacyGroupPath(root, locationName, groupName);
    if ((claims.get(legacy) ?? 0) !== 1) return null;
    try {
        return fs.statSync(legacy).isDirectory() ? legacy : null;
    } catch {
        return null;
    }
}

/** How many groups in the mirror would have been given each legacy folder. */
function legacyNameCounts(root: string, mirror: AgentMirror): Map<string, number> {
    const counts = new Map<string, number>();
    for (const location of mirror.locations) {
        for (const group of location.groups) {
            const legacy = legacyGroupPath(root, location.name, group.name);
            counts.set(legacy, (counts.get(legacy) ?? 0) + 1);
        }
    }
    return counts;
}

/**
 * Which child each folder in a group belongs to, by the id in its name.
 *
 * Folders without an id are not the mirror's and are left alone — they are the "unknown folder" case
 * the scanner reports rather than something to clean up.
 */
function listChildFolders(groupDir: string): Map<number, string> {
    const byId = new Map<number, string>();

    for (const entry of readDirSafe(groupDir)) {
        if (!entry.isDirectory()) continue;
        const id = childIdFromFolder(entry.name);
        if (id !== null) byId.set(id, entry.name);
    }

    return byId;
}

function ensureDir(dir: string): number {
    if (fs.existsSync(dir)) return 0;
    fs.mkdirSync(dir, { recursive: true });
    return 1;
}

/**
 * A directory that cannot be read is empty as far as this pass is concerned.
 *
 * The share can disappear mid-pass — a network blip, a laptop docking — and that is a temporary
 * condition, not a reason to fail. The heartbeat is what makes a share that stays gone visible.
 */
export function readDirSafe(dir: string): fs.Dirent[] {
    try {
        return fs.readdirSync(dir, { withFileTypes: true });
    } catch {
        return [];
    }
}

/** Exported for the mirror's own use and the scanner's: they have to agree on what a folder is called. */
export { safeFolderName };
