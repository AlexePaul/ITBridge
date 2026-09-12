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
    /**
     * A `.url` the agent read and could make nothing of — no address in it, or one that is not
     * `http`/`https`.
     *
     * It has its own value because the repair is its own: the teacher saves the shortcut again, or
     * pastes the address into a text file. Filing it as `unreadable` would send an admin to look
     * for a lock that is not there, and leaving it out altogether is what it used to be — a file
     * the agent retried every thirty seconds for as long as it sat on the share.
     */
    LINK_WITHOUT_ADDRESS = 'link_without_address',
}
