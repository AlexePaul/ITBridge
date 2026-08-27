import 'reflect-metadata';
import { PATH_METADATA, METHOD_METADATA, GUARDS_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { AuthGuard } from './guards/auth.guard';
import { RolesGuard } from './guards/role.guard';
import { ROLE_KEY } from './decorators/role.decorator';
import { Role } from './enum/role.enum';

import { AuthController } from './modules/auth/auth.controller';
import { UserController } from './modules/user/user.controller';
import { ProfileController } from './modules/profile/profile.controller';
import { ChildController } from './modules/child/child.controller';
import { GroupController } from './modules/group/group.controller';
import { AttendanceController } from './modules/attendance/attendance.controller';
import { InvoiceController } from './modules/invoice/invoice.controller';
import { PaymentController } from './modules/payment/payment.controller';
import { DiscountController } from './modules/discount/discount.controller';

/**
 * The authorization matrix, read from Nest metadata.
 *
 * The idea, from E03/S4: protection must not depend on human discipline at every new endpoint. The
 * test enumerates every handler in every controller on its own, so an endpoint added tomorrow
 * without `@UseGuards` shows up here without anyone writing a test for it.
 *
 * This checks metadata, not HTTP: it needs no database and runs in milliseconds. The integration
 * tests under `test/` separately verify that the guards actually reject.
 */

const CONTROLLERS = [
    AuthController,
    UserController,
    ProfileController,
    ChildController,
    GroupController,
    AttendanceController,
    InvoiceController,
    PaymentController,
    DiscountController,
];

/** Endpoints allowed to be public, with the reason. Everything else must carry AuthGuard. */
const PUBLIC_ALLOWLIST = new Set([
    'AuthController.register', // account creation
    'AuthController.login',
    'AuthController.refresh', // authenticates itself, through the refresh token
    // Logging out must work when the access token has already expired, which is the common case.
    // The refresh token in the body is the credential, and revoking an unknown one does nothing.
    'AuthController.logout',
]);

interface Handler {
    controller: string;
    method: string;
    key: string;
    httpMethod: string;
    route: string;
    guards: unknown[];
    roles: Role[] | undefined;
}

function handlersOf(controller: new (...args: never[]) => object): Handler[] {
    const proto = controller.prototype as Record<string, unknown>;
    const classGuards = (Reflect.getMetadata(GUARDS_METADATA, controller) as unknown[]) ?? [];
    const basePath = (Reflect.getMetadata(PATH_METADATA, controller) as string) ?? '';

    return Object.getOwnPropertyNames(proto)
        .filter((name) => name !== 'constructor' && typeof proto[name] === 'function')
        .filter((name) => Reflect.hasMetadata(METHOD_METADATA, proto[name] as object))
        .map((name) => {
            const fn = proto[name] as object;
            const methodGuards = (Reflect.getMetadata(GUARDS_METADATA, fn) as unknown[]) ?? [];
            return {
                controller: controller.name,
                method: name,
                key: `${controller.name}.${name}`,
                httpMethod: RequestMethod[Reflect.getMetadata(METHOD_METADATA, fn) as number],
                route: `/${basePath}${(Reflect.getMetadata(PATH_METADATA, fn) as string) || ''}`.replace(/\/+/g, '/'),
                guards: [...classGuards, ...methodGuards],
                roles: Reflect.getMetadata(ROLE_KEY, fn) as Role[] | undefined,
            };
        });
}

const HANDLERS = CONTROLLERS.flatMap(handlersOf);

describe('authorization matrix', () => {
    it('finds handlers in every controller', () => {
        // A safety net for the test itself: if reflection breaks, everything below would pass empty.
        expect(HANDLERS.length).toBeGreaterThan(20);
        for (const controller of CONTROLLERS) {
            expect(handlersOf(controller).length).toBeGreaterThan(0);
        }
    });

    describe.each(HANDLERS.map((h) => [h.key, h] as const))('%s', (_key, handler) => {
        it('is protected by AuthGuard, or explicitly public', () => {
            if (PUBLIC_ALLOWLIST.has(handler.key)) {
                expect(handler.guards).not.toContain(AuthGuard);
                return;
            }
            expect(handler.guards).toContain(AuthGuard);
        });

        it('brings RolesGuard along whenever it requires a role', () => {
            if (handler.roles === undefined) return;
            expect(handler.guards).toContain(RolesGuard);
        });

        it('does not declare RolesGuard without requiring a role', () => {
            // A RolesGuard with no @Roles lets everything through — a false sense of safety.
            if (!handler.guards.includes(RolesGuard)) return;
            expect(handler.roles).toBeDefined();
        });
    });

    describe('writes are reserved for admins', () => {
        const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

        /**
         * Writes a PARENT is allowed to perform, each with row-level authorization enforced in the
         * service. The list is explicit precisely so that opening up a write becomes a decision
         * rather than an oversight.
         */
        const PARENT_WRITABLE = new Set([
            'AuthController.register',
            'AuthController.login',
            'AuthController.refresh',
            'ProfileController.createProfile', // a parent creates their own profile
            'ProfileController.updateProfile', // the service checks ownership
            'ProfileController.deleteProfile',
            'ChildController.createChild', // the service checks the parent profile
            'ChildController.updateChild',
            'ChildController.deleteChild',
            'AuthController.logout',
            'AuthController.logoutEverywhere', // revokes only the caller's own sessions
        ]);

        const writes = HANDLERS.filter((h) => WRITE_METHODS.includes(h.httpMethod));

        it('has writes to check', () => {
            expect(writes.length).toBeGreaterThan(10);
        });

        it.each(writes.filter((h) => !PARENT_WRITABLE.has(h.key)).map((h) => [h.key, h] as const))('%s cere rolul ADMIN', (_key, handler) => {
            expect(handler.roles).toEqual([Role.ADMIN]);
        });
    });
});
