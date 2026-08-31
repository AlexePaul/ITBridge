/**
 * Why the agent could not say whose work a file is. E14/S2.
 *
 * Each value is a different repair, which is the reason they are not collapsed into one "rejected":
 * a file in the group root is moved into a child's folder, one with a forbidden extension is
 * exported again in another format, and an unknown folder usually means somebody created one by
 * hand next to the mirrored ones.
 */
export enum UnassignedFileReason {
    /** A folder the mirror did not create, so it maps to no child. */
    UNKNOWN_FOLDER = 'unknown_folder',
    /** Dropped in the group folder itself rather than in a child's. */
    GROUP_ROOT = 'group_root',
    EXTENSION_NOT_ALLOWED = 'extension_not_allowed',
    TOO_LARGE = 'too_large',
    /** Locked by another program, or gone by the time the agent reached it. */
    UNREADABLE = 'unreadable',
}
