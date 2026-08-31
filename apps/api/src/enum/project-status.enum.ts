/**
 * Where a document is between the network folder and the parent's inbox. E14/S1.
 *
 * Three values, and they are a projection of what the outbox did — not a second truth kept by
 * hand. `SENT` is written when the messages are queued, `ERROR` when queueing could not happen;
 * whether the provider then accepted them is the outbox's own record (E17/S5).
 *
 * Without the states, an admin coming back the next morning cannot tell what has already gone out
 * from what arrived overnight, which is the one question the group screen exists to answer.
 */
export enum ProjectStatus {
    /** Uploaded, waiting for somebody to look at it. Nothing in this state has left the building. */
    NEW = 'new',
    /** The email is in the queue, addressed to this child's parent. */
    SENT = 'sent',
    /** Sending was attempted and could not even be queued. Visible, never silent. */
    ERROR = 'error',
}
