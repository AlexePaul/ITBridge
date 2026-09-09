import type { AuthenticatedRequest } from 'src/types/authenticated-request';
import type { Actor } from './audit.service';

/**
 * The signed-in user, in the shape the audit log stores — E07 S3.
 *
 * One function rather than each controller building the object, so `actorUsername` is always the
 * name from the token and never something a caller assembled. It exists because the log stores the
 * username as text: the trail has to stay readable after the account is gone, and a row that points
 * at a deleted user is a row that lost the only part anybody wanted to read.
 */
export function actorFrom(req: AuthenticatedRequest): Actor {
    return { userId: req.user.sub, username: req.user.username };
}

/** For the scheduled work, where nobody pressed anything. */
export const SYSTEM_ACTOR: Actor = { userId: null, username: null };
