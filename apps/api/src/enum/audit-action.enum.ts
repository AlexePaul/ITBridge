/**
 * What happened to the row — E07 S3.
 *
 * Deliberately coarse. The audit log answers "who changed this and when"; the shape of the change
 * is in `changes`, and a vocabulary that grows a verb per use case ends up describing the code
 * rather than the act. `CREATED`, `UPDATED` and `DELETED` are what somebody asking the question
 * actually needs to tell apart.
 */
export enum AuditAction {
    CREATED = 'CREATED',
    UPDATED = 'UPDATED',
    DELETED = 'DELETED',
}
