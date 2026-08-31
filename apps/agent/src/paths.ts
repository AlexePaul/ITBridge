import * as path from 'path';

/**
 * The naming rules of the mirrored share, in one place. E14/S2.
 *
 * ```
 * <root>\<Locație>\<Grupă>\<Copil (#12)>\
 * <root>\<Locație>\<Grupă>\_neatribuite\
 * <root>\<Locație>\<Grupă>\<Copil (#12)>\_urcate\<data>\
 * ```
 *
 * **The child's folder carries the id, not just the name.** Two children called Andrei in one group
 * is week three of a school, not an edge case, and a folder somebody renames by hand must not
 * orphan the files inside it. The name is there so a teacher can find the folder; the id is there so
 * the agent can. It is the same rule as the object key on the server side, in another place.
 */

/** Where the agent moves what it has uploaded, so a teacher can see from Explorer what has gone. */
export const UPLOADED_DIR = '_urcate';

/** Where the agent moves what it could not place. Nothing is ever deleted from the share. */
export const UNASSIGNED_DIR = '_neatribuite';

/** Folders the scanner walks past: its own, and whatever Windows and Office leave lying around. */
export const IGNORED_DIRS = new Set([UPLOADED_DIR, UNASSIGNED_DIR, 'System Volume Information', '$RECYCLE.BIN']);

/**
 * Windows forbids these in a file name, and a group called "Scratch 5/6" is not hypothetical.
 * Replaced rather than stripped, so two groups whose names differ only in punctuation do not
 * collapse onto the same folder.
 */
export function safeFolderName(name: string): string {
    return name
        .replace(/[<>:"/\\|?*]/g, '-')
        .replace(/\s+/g, ' ')
        .replace(/[. ]+$/, '')
        .trim()
        .slice(0, 100);
}

/** `Andrei Popescu (#12)`. The id is what the scanner reads back; the name is for the human. */
export function childFolderName(child: { id: number; firstName: string; lastName: string }): string {
    return `${safeFolderName(`${child.firstName} ${child.lastName}`)} (#${child.id})`;
}

/** The id out of a folder name, or null when the folder is not one the mirror made. */
export function childIdFromFolder(folderName: string): number | null {
    const match = /\(#(\d+)\)\s*$/.exec(folderName);
    return match ? Number(match[1]) : null;
}

/** `<root>/<location>/<group>` — where a group's children live. */
export function groupPath(root: string, locationName: string, groupName: string): string {
    return path.join(root, safeFolderName(locationName), safeFolderName(groupName));
}

/** Where an uploaded file is moved to, dated so a term's work does not pile into one folder. */
export function uploadedPath(childDir: string, day: string): string {
    return path.join(childDir, UPLOADED_DIR, day);
}
