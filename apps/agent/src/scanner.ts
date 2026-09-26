import * as fs from 'fs';
import * as path from 'path';
import type { AgentMirror, UnassignedFileReason } from '@itbridge/types';
import { childIdFromFolder, groupPath, IGNORED_DIRS, UNASSIGNED_DIR } from './paths';
import { currentGroupFolders } from './mirror';

/**
 * Deciding whose work a file is, from where it was saved. E14/S2.
 *
 * A child is in exactly one group, so the share is a tree and every file has exactly one path to a
 * child. That is what lets this be a lookup rather than a guess — and it is the first thing that
 * would break if a child were ever in two groups.
 *
 * Nothing here touches the network or reads a file's contents. It walks directory entries, which is
 * cheap even over SMB, and the result is a list the uploader then works through.
 */

/** Roughly 25MB, matching the API's own ceiling. Rejected here so the bytes never cross the network. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Extensions the school accepts. The server checks the actual bytes; this is the cheap first pass. */
export const ALLOWED_EXTENSIONS = new Set([
    '.sb3',
    '.sb2',
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.zip',
    '.pdf',
    '.py',
    '.js',
    '.html',
    '.css',
    '.json',
    '.md',
    '.csv',
    '.txt',
]);

/** A link saved as a file. Windows writes `.url`; a teacher pasting into Notepad writes `.txt`. */
export const LINK_EXTENSIONS = new Set(['.url', '.txt']);

export interface FoundFile {
    absolutePath: string;
    /** Relative to the watched root, for the report and for the log. */
    relativePath: string;
    fileName: string;
    sizeBytes: number;
    /** Last modified, which is when the child actually saved it — not when the agent found it. */
    modifiedAt: Date;
    /** The folder it was found in, so the uploader knows where `_urcate` goes. */
    childDir: string;
    /**
     * The group's `_neatribuite`, carried along for the one refusal the scanner cannot make.
     *
     * Whether a `.url` holds a usable address is only knowable by reading it, which this file
     * deliberately does not do — so the uploader is the one that finds out, and it needs somewhere
     * to put the file when the answer is no.
     */
    unassignedDir: string;
    childId: number;
    groupId: number;
}

export interface RejectedFile {
    absolutePath: string;
    relativePath: string;
    fileName: string;
    sizeBytes: number;
    reason: UnassignedFileReason;
    groupId?: number;
    /** Where it should be moved to: the group's `_neatribuite`, or nowhere when there is no group. */
    unassignedDir?: string;
}

export interface ScanResult {
    files: FoundFile[];
    rejected: RejectedFile[];
    /**
     * Folders the walk could not read — by group id and kind, never by name, since this travels to
     * the log and to the heartbeat.
     *
     * A folder that cannot be read used to be an empty one, so a share that had gone away — the
     * server off, a mapped drive a service cannot see — looked exactly like a quiet afternoon: no
     * files, no error, a healthy heartbeat, and nothing uploading (review of 25 September 2026).
     */
    unreadable: UnreadableFolder[];
}

export interface UnreadableFolder {
    groupId: number;
    /** The group's own folder, a child's folder in it, or a folder somebody made by hand. */
    kind: 'group' | 'child' | 'other';
    /** What the file system said: `EACCES`, `EPERM`, `EIO`. */
    code: string;
}

/** Thrown when the watched folder itself cannot be read: the pass has nothing to walk. */
export class ShareUnreachableError extends Error {
    constructor(readonly code: string) {
        super(`The watched folder cannot be read (${code}); nothing can be uploaded until it can.`);
        this.name = 'ShareUnreachableError';
    }
}

/**
 * Walks every group folder in the mirror and sorts what it finds.
 *
 * Driven by the mirror rather than by the directory listing: a folder on the share that the database
 * knows nothing about is not walked at all, which keeps a stray copy of somebody's holiday photos
 * from turning into three hundred rejection rows.
 */
export function scan(root: string, mirror: AgentMirror, now: Date, quietPeriodMs: number): ScanResult {
    const result: ScanResult = { files: [], rejected: [], unreadable: [] };

    try {
        fs.readdirSync(root);
    } catch (error) {
        throw new ShareUnreachableError(errorCode(error));
    }
    // Where each group's folder is now, not where its name says it should be: a group renamed or
    // moved to the other address keeps its files in the folder the mirror has not moved yet.
    const folders = currentGroupFolders(root, mirror);

    for (const location of mirror.locations) {
        for (const group of location.groups) {
            const groupDir = folders.get(group.id) ?? groupPath(root, location.name, group);
            const childIds = new Set(group.children.map((child) => child.id));
            // A group folder the mirror has not made yet is not a fault: the next refresh makes it.
            const entries = readDir(groupDir, { groupId: group.id, kind: 'group' }, result.unreadable, {
                missingIsEmpty: true,
            });

            for (const entry of entries) {
                const entryPath = path.join(groupDir, entry.name);

                if (entry.isFile()) {
                    // Saved into the group folder rather than into a child's. The commonest mistake
                    // there is, and the one an admin can fix in ten seconds if they are told.
                    //
                    // Looked at on disk like anything else, and for both of the reasons the child
                    // folders are: a file still being copied is not this pass's business — moving
                    // it to `_neatribuite` mid-copy is how a truncated file gets filed as the whole
                    // of somebody's work — and a refusal that reports "0 B" tells an admin the file
                    // is empty when it is not.
                    const rejection = describeOnDisk(root, entryPath, entry.name, now, quietPeriodMs);
                    if (rejection === 'still-being-written') continue;
                    result.rejected.push({
                        ...rejection.described,
                        reason: rejection.readable ? 'group_root' : 'unreadable',
                        groupId: group.id,
                        unassignedDir: path.join(groupDir, UNASSIGNED_DIR),
                    });
                    continue;
                }
                if (!entry.isDirectory() || IGNORED_DIRS.has(entry.name)) continue;

                const childId = childIdFromFolder(entry.name);
                if (childId === null || !childIds.has(childId)) {
                    // A folder somebody made by hand, or one belonging to a child who has since
                    // moved. Its contents are reported one by one rather than as "a folder", because
                    // what an admin has to decide is per file.
                    for (const file of filesIn(entryPath, { groupId: group.id, kind: 'other' }, result.unreadable)) {
                        const rejection = describeOnDisk(root, file.path, file.name, now, quietPeriodMs);
                        if (rejection === 'still-being-written') continue;
                        result.rejected.push({
                            ...rejection.described,
                            reason: rejection.readable ? 'unknown_folder' : 'unreadable',
                            groupId: group.id,
                            unassignedDir: path.join(groupDir, UNASSIGNED_DIR),
                        });
                    }
                    continue;
                }

                for (const file of filesIn(entryPath, { groupId: group.id, kind: 'child' }, result.unreadable)) {
                    const stats = statSafe(file.path);
                    if (!stats) {
                        result.rejected.push({
                            ...describe(root, file.path, file.name),
                            reason: 'unreadable',
                            groupId: group.id,
                            unassignedDir: path.join(groupDir, UNASSIGNED_DIR),
                        });
                        continue;
                    }

                    // Still being written. Not an error and not reported — it is simply not this
                    // pass's business, and the next one is thirty seconds away.
                    if (now.getTime() - stats.mtimeMs < quietPeriodMs) continue;

                    const extension = path.extname(file.name).toLowerCase();
                    if (!ALLOWED_EXTENSIONS.has(extension) && !LINK_EXTENSIONS.has(extension)) {
                        result.rejected.push({
                            ...describe(root, file.path, file.name, stats.size),
                            reason: 'extension_not_allowed',
                            groupId: group.id,
                            unassignedDir: path.join(groupDir, UNASSIGNED_DIR),
                        });
                        continue;
                    }
                    if (stats.size > MAX_FILE_BYTES) {
                        result.rejected.push({
                            ...describe(root, file.path, file.name, stats.size),
                            reason: 'too_large',
                            groupId: group.id,
                            unassignedDir: path.join(groupDir, UNASSIGNED_DIR),
                        });
                        continue;
                    }

                    result.files.push({
                        absolutePath: file.path,
                        relativePath: path.relative(root, file.path),
                        fileName: file.name,
                        sizeBytes: stats.size,
                        modifiedAt: stats.mtime,
                        childDir: entryPath,
                        unassignedDir: path.join(groupDir, UNASSIGNED_DIR),
                        childId,
                        groupId: group.id,
                    });
                }
            }
        }
    }

    return result;
}

/**
 * Files directly inside a child's folder, and nothing deeper.
 *
 * Deliberately not recursive: `_urcate` lives one level down and holds everything already sent, so a
 * recursive walk would re-upload a term's work on every pass. A teacher who makes their own
 * subfolder gets nothing uploaded from it — visible on the group screen as a child with no
 * documents, which is a better failure than silently hoovering up whatever is nested there.
 */
function filesIn(
    dir: string,
    which: Omit<UnreadableFolder, 'code'>,
    unreadable: UnreadableFolder[],
): { path: string; name: string }[] {
    return readDir(dir, which, unreadable)
        .filter((entry) => entry.isFile() && !entry.name.startsWith('~$') && !entry.name.startsWith('.'))
        .map((entry) => ({ path: path.join(dir, entry.name), name: entry.name }));
}

/**
 * A directory listing that says when it could not be had, instead of passing for an empty folder.
 * What goes into `unreadable` is ids only, because it ends up in the log and the heartbeat.
 */
function readDir(
    dir: string,
    which: Omit<UnreadableFolder, 'code'>,
    unreadable: UnreadableFolder[],
    options: { missingIsEmpty?: boolean } = {},
): fs.Dirent[] {
    try {
        return fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
        const code = errorCode(error);
        if (!(options.missingIsEmpty && code === 'ENOENT')) unreadable.push({ ...which, code });
        return [];
    }
}

function errorCode(error: unknown): string {
    return (
        (error as NodeJS.ErrnoException | undefined)?.code ?? (error instanceof Error ? error.message : String(error))
    );
}

function describe(root: string, absolutePath: string, fileName: string, sizeBytes = 0) {
    return { absolutePath, relativePath: path.relative(root, absolutePath), fileName, sizeBytes };
}

/**
 * A file about to be refused, sized from disk and held back while it is still being written.
 *
 * The quiet period matters more here than it does for a file that will be uploaded. An upload that
 * catches a half-written file leaves the original where it is and the next pass sends the whole
 * thing; a refusal *moves* the file, so catching it halfway files a fragment in `_neatribuite` and
 * a teacher's copy is gone from where they put it.
 *
 * A file that cannot be stat-ed at all is reported `unreadable` rather than for where it sat — the
 * same answer the child-folder branch has always given, because "locked, or gone between the
 * listing and the look" is the more useful of the two sentences.
 */
function describeOnDisk(
    root: string,
    absolutePath: string,
    fileName: string,
    now: Date,
    quietPeriodMs: number,
): 'still-being-written' | { described: ReturnType<typeof describe>; readable: boolean } {
    const stats = statSafe(absolutePath);
    if (!stats) return { described: describe(root, absolutePath, fileName), readable: false };
    if (now.getTime() - stats.mtimeMs < quietPeriodMs) return 'still-being-written';
    return { described: describe(root, absolutePath, fileName, stats.size), readable: true };
}

function statSafe(file: string): fs.Stats | null {
    try {
        return fs.statSync(file);
    } catch {
        return null;
    }
}

/**
 * The day a file belongs to, from the local components of its modification time.
 *
 * Never `toISOString().slice(0, 10)`: that is the UTC day, which in Romania is yesterday for
 * anything saved after 02:00 or 03:00 in summer. The mistake is exactly one day, and a document
 * filed under the wrong date is one an admin cannot find on the screen for the class it came from.
 */
export function dayOf(date: Date): string {
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
}
