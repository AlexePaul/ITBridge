import * as fs from 'fs';
import * as path from 'path';
import type { AgentMirror } from '@itbridge/types';
import { childFolderName, childIdFromFolder, groupPath, safeFolderName, UNASSIGNED_DIR } from './paths';
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

    for (const location of mirror.locations) {
        for (const group of location.groups) {
            const groupDir = groupPath(root, location.name, group.name);
            created += ensureDir(groupDir);
            // Every group gets one, empty or not: a teacher who saves into the wrong place needs
            // somewhere for the file to end up, and creating it lazily would mean the first stray
            // file of the year arrives before the folder that catches it.
            created += ensureDir(path.join(groupDir, UNASSIGNED_DIR));

            const existing = listChildFolders(groupDir);

            for (const child of group.children) {
                const wanted = childFolderName(child);
                const current = existing.get(child.id);

                if (!current) {
                    created += ensureDir(path.join(groupDir, wanted));
                    continue;
                }
                if (current !== wanted) {
                    // A child whose name was corrected in the database. The folder follows, and the
                    // files inside it come along — which is the whole reason the id is in the name
                    // rather than the name being the identifier.
                    try {
                        fs.renameSync(path.join(groupDir, current), path.join(groupDir, wanted));
                        renamed++;
                    } catch (error) {
                        // A file open in Scratch keeps its folder locked on Windows. Nothing is
                        // lost: the old folder still carries the id, so the scanner still places
                        // its files correctly, and the rename is tried again next time.
                        log.warn(
                            `Could not rename a child folder in ${path.relative(root, groupDir)}: ${error instanceof Error ? error.message : String(error)}`,
                        );
                    }
                }
            }
        }
    }

    return { created, renamed };
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
