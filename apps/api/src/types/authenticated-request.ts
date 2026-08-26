import { Request } from 'express';
import { Role } from 'src/enum/role.enum';

/**
 * The access-token payload, as signed by `AuthService.generateTokens`.
 *
 * `sub` is the user id. Row-level authorization in the services keys off it, so every controller
 * must take identity from here and never from the body or the query string.
 */
export interface JwtPayload {
    sub: number;
    username: string;
    role: Role;
    iat?: number;
    exp?: number;
}

/** A request that has passed through `AuthGuard`, which attaches the payload as `req.user`. */
export interface AuthenticatedRequest extends Request {
    user: JwtPayload;
}
