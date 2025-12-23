import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';

@Injectable()
export class UserIdResolutionGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest();
        const user = request.user;
        const requestedUserId = request.query.userId ? Number(request.query.userId) : undefined;

        if (!user) {
            throw new ForbiddenException('User not authenticated');
        }

        // Calculate the actual userId to use
        if (user.role === 'ADMIN') {
            // Admin can specify any userId, or leave undefined to see all
            request.resolvedUserId = requestedUserId;
        } else {
            // Non-admin: reject if they try to specify userId
            if (requestedUserId !== undefined) {
                throw new ForbiddenException('Only admins can specify userId');
            }
            // Use their own ID
            request.resolvedUserId = user.sub;
        }

        return true;
    }
}
