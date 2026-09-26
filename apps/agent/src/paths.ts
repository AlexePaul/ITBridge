import * as path from 'path';

/**
 * The naming rules of the mirrored share, in one place. E14/S2.
 *
 * ```
 * <root>\<Locație>\<Grupă (grupa 7)>\<Copil (#12)>\
 * <root>\<Locație>\<Grupă (grupa 7)>\_neatribuite\
 * <root>\<Locație>\<Grupă (grupa 7)>\<Copil (#12)>\_urcate\<data>\
 * ```
 *
 * **The child's folder carries the id, not just the name.** Two children called Andrei in one group
 * is week three of a school, not an edge case, and a folder somebody renames by hand must not
 * orphan the files inside it. The name is there so a teacher can find the folder; the id is there so
 * the agent can. It is the same rule as the object key on the server side, in another place.
 *
 * **And so does the group's** (review of 25 September 2026). It was named after the group alone,
 * which broke the rule in both directions: a group renamed by an admin, or moved to the other
 * address, got a new empty tree while teachers kept saving into the old one — which nothing walked
 * any more, so those files were never uploaded and never reported — and two groups with the same
 * name at one address shared a folder, each filing the other's children as unknown. The location
 * folder keeps its plain name: a group is found by its id wherever it sits under the root, and the
 * mirror moves it to where it belongs.
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

/** `Scratch Începători (grupa 7)`. The id is what the agent reads back; the name is for the teacher. */
export function groupFolderName(group: { id: number; name: string }): string {
    return `${safeFolderName(group.name)} (grupa ${group.id})`;
}

/** The group's id out of a folder name, or null when the folder is not one the mirror made. */
export function groupIdFromFolder(folderName: string): number | null {
    const match = /\(grupa (\d+)\)\s*$/.exec(folderName);
    return match ? Number(match[1]) : null;
}

/** `<root>/<location>/<group (grupa 7)>` — where a group's folder belongs. */
export function groupPath(root: string, locationName: string, group: { id: number; name: string }): string {
    return path.join(root, safeFolderName(locationName), groupFolderName(group));
}

/**
 * Where a group's folder was before its folder carried an id: `<root>/<location>/<group>`. Read once,
 * by the mirror, to move a tree made by an earlier build to its new name with the files inside it.
 */
export function legacyGroupPath(root: string, locationName: string, groupName: string): string {
    return path.join(root, safeFolderName(locationName), safeFolderName(groupName));
}

/** Where an uploaded file is moved to, dated so a term's work does not pile into one folder. */
export function uploadedPath(childDir: string, day: string): string {
    return path.join(childDir, UPLOADED_DIR, day);
}
