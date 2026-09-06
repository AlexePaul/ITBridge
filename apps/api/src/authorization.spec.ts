import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { PATH_METADATA, METHOD_METADATA, GUARDS_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { AuthGuard } from './guards/auth.guard';
import { RolesGuard } from './guards/role.guard';
import { ROLE_KEY } from './decorators/role.decorator';
import { Role } from './enum/role.enum';

import { CONTROLLERS } from './testing/controllers';

/** Endpoints allowed to be public, with the reason. Everything else must carry AuthGuard. */
const PUBLIC_ALLOWLIST = new Set([
    'AuthController.register', // account creation
    'AuthController.login',
    'AuthController.refresh', // authenticates itself, through the refresh token
    // Logging out must work when the access token has already expired, which is the common case.
    // The refresh token in the body is the credential, and revoking an unknown one does nothing.
    'AuthController.logout',
    // The confirmation link from E11/S2 is opened in a mail client, often on a device that has
    // never signed in. Requiring the account it unlocks would be a circle; the token is the
    // credential, exactly as on `logout`.
    'AuthController.confirmEmail',
    // A liveness/readiness checker has no credentials, and neither endpoint reveals anything.
    'HealthController.health',
    'HealthController.ready',
    // E20/S2. Booking a trial is public by decision, not by omission: it is a lead, not an
    // enrolment, and requiring an account first would put the school's own sign-up barrier in front
    // of the thing that exists to lower it. Neither endpoint creates a `User` or reveals a family:
    // the read offers group names and hours the website already publishes, and the write only adds.
    // Both are throttled well below the global bucket.
    'TrialController.slots',
    'TrialController.book',
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
    it('covers every controller file on disk', () => {
        // The list in `testing/controllers.ts` is still written by hand, so this is what stops it
        // being forgotten. A whole controller missing from it used to opt every one of its
        // endpoints out of the matrix silently — which is exactly what happened to HealthController
        // when it was added, while the docs claimed the coverage was automatic.
        const modulesDir = path.join(__dirname, 'modules');
        const onDisk = fs
            .readdirSync(modulesDir, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .flatMap((entry) =>
                fs
                    .readdirSync(path.join(modulesDir, entry.name))
                    .filter((file) => file.endsWith('.controller.ts'))
                    .map((file) => path.join(entry.name, file)),
            );

        const known = new Set(CONTROLLERS.map((c) => c.name));
        const missing = onDisk.filter((file) => {
            const source = fs.readFileSync(path.join(modulesDir, file), 'utf8');
            const names = [...source.matchAll(/export class (\w+)/g)].map((m) => m[1]);
            return names.length > 0 && !names.some((name) => known.has(name));
        });

        expect(missing).toEqual([]);
    });

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
            'AuthController.confirmEmail', // public; the token in the body is the credential
            // Sends only to the address already on file, for the caller's own account — it takes no
            // address, so a session cannot be used to point a confirmation somewhere else.
            'AuthController.resendConfirmation',
            // E14/S7. A parent may say "this does not look like my child's work"; the write it
            // performs is a message to the office, not a change to the document. Deleting or
            // reassigning one stays with ADMIN, which is the point of this list existing.
            'ProjectController.reportProject',
            // E12/S3. A parent announces that their own child will miss a class, and withdraws the
            // announcement. Both are narrowed in `AbsenceNoticeService` on the child's own family —
            // and to a 404, not a 403, so an id belonging to somebody else does not confirm that it
            // belongs to anybody. Marking the register stays with ADMIN: saying you will be away is
            // the family's to say, recording what happened is not.
            'AttendanceController.announceAbsence',
            'AttendanceController.withdrawAbsence',
            // E12/S4 used to add two more here — a parent booking their own child's make-up and
            // cancelling it, on the acceptance criterion that they do it „fără telefon". Both are
            // gone with the credit. Moving a child into another group for the week is the office's
            // decision and its endpoints are ADMIN, which is why this list got shorter rather than
            // longer as the story grew.
            // E20/S2, and the only write in this list that is not merely parent-reachable but fully
            // public. It writes a lead, and with it a shell profile, a child and a trial enrolment —
            // which is as far as it goes: it cannot create an account, cannot enrol anybody for
            // real, and cannot exceed a group's capacity, because it takes the same seat through the
            // same `EnrollmentService` every admin screen does.
            'TrialController.book',
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
